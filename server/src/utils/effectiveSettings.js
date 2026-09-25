import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Family } from '../models/Family.js';
import { PlatformSettings } from '../models/PlatformSettings.js';

/**
 * The three deployment-wide operational limits. Controlled ONLY by the platform admin
 * (`PlatformSettings.*`, edited from /platform-settings) — resolution is platform value -> env,
 * nothing else. There is deliberately NO per-family tier any more (see docs/DECISIONS.md
 * "Operational settings"): an old `Family.settings.maxFileMB`/`storageLimitMB`/
 * `activityRetentionDays` value that may still sit in the DB from before this change is never
 * read, so a stale, now-invisible per-family override can't silently win.
 */
const PLATFORM_LIMIT_KEYS = ['activityRetentionDays', 'maxFileMB', 'storageLimitMB'];

/** `platform` (a PlatformSettings row/lean object, or null) -> the three limits resolved to env. */
export function resolvePlatformLimits(platform) {
  return {
    activityRetentionDays: platform?.activityRetentionDays ?? env.ACTIVITY_RETENTION_DAYS,
    maxFileMB: platform?.maxFileMB ?? env.MAX_FILE_MB,
    storageLimitMB: platform?.storageLimitMB ?? env.STORAGE_LIMIT_MB,
  };
}

/**
 * Sync resolution of a family's effective settings. `familyOrSettings` only contributes the
 * settings that are genuinely per-family (`defaultShareDuration`); the three operational limits
 * come from `platform` (pass the PlatformSettings row when you have it — without it they resolve
 * to the env defaults). Any per-family value for those three is ignored on purpose.
 */
export function resolveFamilySettings(familyOrSettings, platform = null) {
  const settings = familyOrSettings?.settings || familyOrSettings || {};
  return {
    ...resolvePlatformLimits(platform),
    defaultShareDuration: settings.defaultShareDuration || '12h',
  };
}

/**
 * Loads the platform row's three limit fields. Never throws, same defensive shape as
 * services/mailer.js#loadPlatformSmtp(): a `readyState` check avoids Mongoose's connect-buffering
 * timeout when no DB is connected (e.g. a unit test exercising this module in isolation), and any
 * other failure just resolves to `null` (= env defaults) instead of surfacing an error.
 * Deliberately uncached — one small primary-key read per call, so a platform admin's change takes
 * effect on the very next upload/log/alert.
 */
async function loadPlatformLimits() {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    return await PlatformSettings.findById('platform').select(PLATFORM_LIMIT_KEYS.join(' ')).lean();
  } catch {
    return null;
  }
}

/** Platform value -> env for maxFileMB / storageLimitMB / activityRetentionDays. Never throws. */
export async function getEffectivePlatformLimits() {
  return resolvePlatformLimits(await loadPlatformLimits());
}

/**
 * Look up a family by id and resolve its effective settings in one call. Never throws — a lookup
 * failure (bad id, transient DB issue) resolves to defaults rather than blocking whatever feature
 * called it (file upload, activity logging, storage alerts all treat "can't reach settings" as
 * "use the default", not as an error to surface to the user).
 */
export async function getEffectiveFamilySettings(familyId) {
  let family = null;
  if (mongoose.connection.readyState === 1) {
    try {
      family = await Family.findById(familyId).select('settings.defaultShareDuration').lean();
    } catch {
      family = null;
    }
  }
  return resolveFamilySettings(family, await loadPlatformLimits());
}
