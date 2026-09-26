import { describeBrowser, describeDevice, describeOs } from '../utils/device.js';

import { isTest } from '../config/env.js';
import { Membership } from '../models/Membership.js';
import { User } from '../models/User.js';
import { Family } from '../models/Family.js';
import { Activity } from '../models/Activity.js';
import { sendMail } from './mailer.js';
import * as templates from './emailTemplates.js';
import { getEffectivePlatformLimits } from '../utils/effectiveSettings.js';
import { PlatformAdmin } from '../models/PlatformAdmin.js';
import { superAdminEmail } from './platformRoles.js';

/**
 * Admin instant alerts. `onActivity()` is called (fire-and-forget, already wrapped in a catch by
 * the caller) after every Activity write — see `server/src/services/activityLogger.js`.
 * Family-agnostic: switches on `activity.action`.
 *
 * Event keys (used as `Membership.notificationPrefs.instant[eventKey]`) — documented here for
 * whoever builds the Settings > Notifications toggle UI later:
 *   member_added, member_removed, member_disabled, member_access_change, invite_accepted,
 *   document_folder_delete, failed_logins, new_device_login.
 * Any of these set to `false` on an admin's own membership turns that one alert off for them.
 * The storage warning is not a family alert: it goes to the platform admins (see
 * `checkStorageThreshold`).
 *
 * NOTE: there is deliberately no daily digest here. An earlier draft of this module had one
 * (plus a `POST /api/internal/cron/daily` trigger, then an opportunistic "check on activity"
 * trigger) but it was dropped mid-build: the Dashboard and Activity Log already surface recent
 * uploads and share opens/downloads on demand, and
 * for a family that opens the app once or twice a week a separate summary email was redundant.
 * Instant alerts below are everything this module does now.
 */

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
// Real 5s window in production (per the brief); short in tests so alert tests don't sleep 5s —
// long enough (300ms) to reliably batch two back-to-back requests even on a slow sandboxed CI box.
const DELETE_BATCH_WINDOW_MS = isTest ? 300 : 5000;

export async function onActivity(activity, ctx = {}) {
  if (!activity) return;
  try {
    await route(activity, ctx);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[alerts] failed handling activity:', err?.message || err);
  }
}

async function route(activity, ctx = {}) {
  switch (activity.action) {
    case 'member.create':
      return alertMemberAdded(activity);
    case 'member.delete':
      return alertMemberRemoved(activity);
    case 'member.update':
      return alertMemberUpdate(activity);
    case 'member.access_change':
      return alertInviteAccepted(activity);
    case 'document.delete':
    case 'folder.delete':
      return scheduleDeleteBatch(activity);
    case 'document.create':
    case 'document.file.add':
      return checkStorageThreshold(activity.familyId);
    case 'auth.login':
      return alertNewDeviceLogin(activity, ctx);
    case 'auth.login_failed':
      return alertFailedLogins(activity);
    default:
      return undefined;
  }
}

// ---------- shared helpers ----------

async function getFamilyName(familyId) {
  const family = await Family.findById(familyId).select('name').lean();
  return family?.name || 'Family Vault';
}

/** Admins (role:'admin', status:'active') whose own instant prefs allow `eventKey` (default on). */
async function getInstantRecipients(familyId, eventKey) {
  const admins = await Membership.find({ familyId, role: 'admin', status: 'active' }).lean();
  const eligible = admins.filter((m) => m.userId && m.notificationPrefs?.instant?.[eventKey] !== false);
  return attachEmails(eligible);
}

async function attachEmails(memberships) {
  if (!memberships.length) return [];
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) }, disabled: { $ne: true } }, 'email').lean();
  const emailById = new Map(users.map((u) => [String(u._id), u.email]));
  return memberships
    .filter((m) => emailById.has(String(m.userId)))
    .map((m) => ({ membership: m, email: emailById.get(String(m.userId)) }));
}

/**
 * The platform (app-wide) admins: the super admin from the environment plus the admins added in
 * the admin panel. Used for alerts only they can act on, like a family nearing the storage warning
 * size (families can't see or change that size).
 */
async function getPlatformAdminRecipients() {
  const emails = new Set();
  const sa = superAdminEmail();
  if (sa) emails.add(sa);
  const admins = await PlatformAdmin.find({}, 'email').lean();
  admins.forEach((a) => a.email && emails.add(String(a.email).toLowerCase()));
  if (!emails.size) return [];
  const disabled = new Set(
    (await User.find({ email: { $in: [...emails] }, disabled: true }, 'email').lean()).map((u) => u.email),
  );
  return [...emails].filter((e) => !disabled.has(e)).map((email) => ({ email }));
}

/** Sends the same already-built `{subject, html, text}` email to every recipient's own inbox. */
async function notifyAdmins(recipients, email) {
  await Promise.all(recipients.map((r) => sendMail({ to: r.email, subject: email.subject, html: email.html, text: email.text })));
}

// ---------- member events ----------

async function alertMemberAdded(activity) {
  const recipients = await getInstantRecipients(activity.familyId, 'member_added');
  if (!recipients.length) return;
  const membership = await Membership.findById(activity.targetId).lean();
  const email = templates.adminAlertEmail({
    familyName: await getFamilyName(activity.familyId),
    eventTitle: 'New member added',
    eventDescription: `${membership?.name || 'A new member'} was added to your family vault.`,
  });
  await notifyAdmins(recipients, email);
}

async function alertMemberRemoved(activity) {
  const recipients = await getInstantRecipients(activity.familyId, 'member_removed');
  if (!recipients.length) return;
  const email = templates.adminAlertEmail({
    familyName: await getFamilyName(activity.familyId),
    eventTitle: 'Member removed',
    eventDescription: `${activity.meta?.name || 'A member'} was removed from your family vault.`,
  });
  await notifyAdmins(recipients, email);
}

async function alertMemberUpdate(activity) {
  const changedKeys = activity.meta?.changedKeys || [];
  if (!changedKeys.includes('status') && !changedKeys.includes('access')) return;

  const membership = await Membership.findById(activity.targetId).lean();
  if (!membership) return;

  if (changedKeys.includes('status') && membership.status === 'disabled') {
    const recipients = await getInstantRecipients(activity.familyId, 'member_disabled');
    if (recipients.length) {
      const email = templates.adminAlertEmail({
        familyName: await getFamilyName(activity.familyId),
        eventTitle: 'Member disabled',
        eventDescription: `${membership.name} was disabled and signed out of all devices.`,
      });
      await notifyAdmins(recipients, email);
    }
  }

  if (changedKeys.includes('access')) {
    const recipients = await getInstantRecipients(activity.familyId, 'member_access_change');
    if (recipients.length) {
      const email = templates.adminAlertEmail({
        familyName: await getFamilyName(activity.familyId),
        eventTitle: 'Member access changed',
        eventDescription: `${membership.name}'s access level was changed to "${membership.access}".`,
      });
      await notifyAdmins(recipients, email);
    }
  }
}

/** `member.access_change` is logged by POST /auth/accept-invite with `meta.event: 'invite_accepted'`. */
async function alertInviteAccepted(activity) {
  if (activity.meta?.event !== 'invite_accepted') return;
  const recipients = await getInstantRecipients(activity.familyId, 'invite_accepted');
  if (!recipients.length) return;
  const membership = await Membership.findById(activity.targetId).lean();
  const email = templates.inviteAcceptedEmail({
    familyName: await getFamilyName(activity.familyId),
    memberName: membership?.name || 'A member',
  });
  await notifyAdmins(recipients, email);
}

// ---------- document/folder delete batching ----------
// A short in-memory debounce per familyId+actorMembershipId so a multi-select delete (or a
// recursive folder delete cascading into many document.delete activities) sends ONE email
// instead of one per item. Resets on server restart — the worst case is a burst that straddles
// a restart sends two smaller emails instead of one, never a lost alert.

const deleteBatches = new Map();

function scheduleDeleteBatch(activity) {
  const key = `${activity.familyId}:${activity.actorMembershipId || 'unknown'}`;
  const kind = activity.action === 'folder.delete' ? 'folder' : 'document';
  const label = activity.meta?.title || (kind === 'folder' ? 'a folder' : 'a document');

  let batch = deleteBatches.get(key);
  if (!batch) {
    batch = { familyId: activity.familyId, items: [], timer: null };
    deleteBatches.set(key, batch);
  }
  batch.items.push({ kind, label });

  clearTimeout(batch.timer);
  batch.timer = setTimeout(() => {
    deleteBatches.delete(key);
    flushDeleteBatch(batch).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[alerts] delete-batch alert failed:', err?.message || err);
    });
  }, DELETE_BATCH_WINDOW_MS);
  batch.timer.unref?.();
}

async function flushDeleteBatch(batch) {
  const recipients = await getInstantRecipients(batch.familyId, 'document_folder_delete');
  if (!recipients.length) return;

  const docCount = batch.items.filter((i) => i.kind === 'document').length;
  const folderCount = batch.items.filter((i) => i.kind === 'folder').length;
  const parts = [];
  if (docCount) parts.push(`${docCount} document${docCount === 1 ? '' : 's'}`);
  if (folderCount) parts.push(`${folderCount} folder${folderCount === 1 ? '' : 's'}`);

  const email = templates.adminAlertEmail({
    familyName: await getFamilyName(batch.familyId),
    eventTitle: 'Items deleted',
    eventDescription: `${parts.join(' and ')} ${batch.items.length === 1 ? 'was' : 'were'} deleted.`,
    detailsList: batch.items.slice(0, 20).map((i) => `${i.kind === 'folder' ? 'Folder' : 'Document'}: ${i.label}`),
  });
  await notifyAdmins(recipients, email);
}

// ---------- login security ----------

async function alertNewDeviceLogin(activity, ctx = {}) {
  // NOTE: `auth.login` is logged via `reqCtx(req)` (service.js/googleService.js), not a real
  // authenticated `req` — so `activity.actorMembershipId` is always null here (it's only ever
  // populated from `req.auth`, which doesn't exist pre-login). `activity.targetId` (the User id)
  // is what's actually set on every `auth.login` activity, so that's the identity to key off.
  if (!activity.targetId) return;
  const recipients = await getInstantRecipients(activity.familyId, 'new_device_login');
  if (!recipients.length) return;

  const priorLogins = await Activity.find({
    familyId: activity.familyId,
    targetType: 'user',
    targetId: activity.targetId,
    action: 'auth.login',
    _id: { $ne: activity._id },
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('ipHash userAgent')
    .lean();

  if (!priorLogins.length) return; // first-ever login on record for this account — no baseline yet

  const seen = new Set(priorLogins.map((a) => `${a.ipHash || ''}:${a.userAgent || ''}`));
  const current = `${activity.ipHash || ''}:${activity.userAgent || ''}`;
  if (seen.has(current)) return;

  const membership = await Membership.findOne({ userId: activity.targetId }).lean();
  const email = templates.newDeviceLoginEmail({
    memberName: membership?.name,
    device: describeDevice(activity.userAgent),
    os: describeOs(activity.userAgent),
    browser: describeBrowser(activity.userAgent, { withVersion: true }),
    ip: ctx.ip ? String(ctx.ip).replace(/^::ffff:/, '') : null,
    time: activity.createdAt,
  });
  await notifyAdmins(recipients, email);
}

/**
 * `auth.login_failed` is logged by auth/service.js's `login()` for known accounts only (an
 * unknown email has no familyId to attribute the log to, and no signal is ever returned to the
 * caller either way, so account existence still isn't leaked). Fires exactly once, on the 5th
 * failure inside the 15-minute window.
 */
async function alertFailedLogins(activity) {
  if (!activity.targetId) return;
  const since = new Date(Date.now() - FIFTEEN_MIN_MS);
  const count = await Activity.countDocuments({
    familyId: activity.familyId,
    targetId: activity.targetId,
    action: 'auth.login_failed',
    createdAt: { $gte: since },
  });
  if (count !== 5) return;

  const recipients = await getInstantRecipients(activity.familyId, 'failed_logins');
  if (!recipients.length) return;
  const email = templates.adminAlertEmail({
    familyName: await getFamilyName(activity.familyId),
    eventTitle: 'Repeated failed sign-in attempts',
    eventDescription: '5 failed sign-in attempts were made on one account within 15 minutes.',
  });
  await notifyAdmins(recipients, email);
}

// ---------- storage threshold ----------
// `Map<familyId, {alerted80, alerted95}>` in memory. Resets on server restart, which just means a
// possible duplicate 80%/95% alert after a redeploy — an acceptable tradeoff over adding a new
// collection/field for a once-in-a-while, non-critical notification.

const storageAlertState = new Map();

async function checkStorageThreshold(familyId) {
  const family = await Family.findById(familyId).select('storageBytes').lean();
  if (!family) return;
  // Platform-admin-controlled threshold (PlatformSettings.storageLimitMB -> env.STORAGE_LIMIT_MB);
  // never a per-family value — see utils/effectiveSettings.js.
  const { storageLimitMB } = await getEffectivePlatformLimits();
  const limitBytes = storageLimitMB * 1024 * 1024;
  if (!limitBytes) return;
  const pct = family.storageBytes / limitBytes;

  const key = String(familyId);
  const state = storageAlertState.get(key) || { alerted80: false, alerted95: false };

  let threshold = null;
  if (pct >= 0.95 && !state.alerted95) {
    threshold = 95;
    state.alerted95 = true;
    state.alerted80 = true;
  } else if (pct >= 0.8 && !state.alerted80) {
    threshold = 80;
    state.alerted80 = true;
  }
  storageAlertState.set(key, state);
  if (!threshold) return;

  // Goes to the platform admins, not the family: the warning size is theirs to set and act on.
  const recipients = await getPlatformAdminRecipients();
  if (!recipients.length) return;

  const usedMb = Math.round(family.storageBytes / (1024 * 1024));
  const familyName = await getFamilyName(familyId);
  const email = templates.adminAlertEmail({
    familyName,
    eventTitle: `${familyName} has used ${threshold}% of the storage warning size`,
    eventDescription: `${familyName} has stored ${usedMb} MB — ${threshold}% or more of the ${storageLimitMB} MB warning size set in the admin panel. Nothing is blocked; this is only a heads-up.`,
  });
  await notifyAdmins(recipients, email);
}

/** Test-only hook: clears in-memory debounce/threshold state between test files. */
export function _resetAlertStateForTests() {
  storageAlertState.clear();
  for (const batch of deleteBatches.values()) clearTimeout(batch.timer);
  deleteBatches.clear();
}
