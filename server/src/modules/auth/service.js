import bcrypt from 'bcryptjs';

import { User } from '../../models/User.js';
import { Family } from '../../models/Family.js';
import { Membership } from '../../models/Membership.js';
import { getPlatformSettings } from '../../models/PlatformSettings.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import * as tokenService from './tokenService.js';
import { serializeUser } from './serializers.js';
import { env } from '../../config/env.js';
import { sendMail } from '../../services/mailer.js';
import * as emailTemplates from '../../services/emailTemplates.js';
import { mintPasswordResetToken, findValidPasswordResetToken } from '../../services/passwordResetTokens.js';

const BCRYPT_COST = 12;

export function reqCtx(req) {
  // logActivity accepts either a real Express req or this minimal shape. Exported so
  // googleService.js (pre-auth Google sign-in/signup, same situation as password
  // signup/login below — no req.auth yet) can log activity the same way.
  return { headers: req?.headers, ip: req?.ip, socket: req?.socket };
}

/**
 * Global login-method gate (docs/API.md "Platform settings", docs/DECISIONS.md "Platform
 * settings"): a deployment-wide switch, independent of any family/membership. Checked at the top
 * of every account-creation/sign-in entry point below, BEFORE any DB lookup specific to that
 * flow. `method` is which credential type the caller is attempting to use right now — 'password'
 * for signup/login, 'google' for the Google sign-in/complete flow.
 */
export async function assertLoginMethodAllowed(method) {
  const { allowedLoginMethods } = await getPlatformSettings();
  if (allowedLoginMethods === 'both' || allowedLoginMethods === method) return;
  const message =
    method === 'password'
      ? 'This app only allows Google sign-in'
      : 'This app only allows password sign-in';
  throw new ApiError(403, 'LOGIN_METHOD_NOT_ALLOWED', message);
}

/**
 * Shared "membership row -> API summary" shape used by GET /auth/me and every auth endpoint that
 * returns a session (signup/login/google/accept-invite) — docs/API.md's
 * `{ id, familyId, familyName, role, access, isOwner, status }`.
 */
function summarizeMemberships(memberships, nameById) {
  return memberships.map((m) => ({
    id: String(m._id),
    familyId: String(m.familyId),
    familyName: nameById.get(String(m.familyId)) || '',
    role: m.role,
    access: m.access,
    isOwner: m.isOwner,
    status: m.status,
  }));
}

async function familyNamesById(familyIds) {
  if (!familyIds.length) return new Map();
  const families = await Family.find({ _id: { $in: familyIds } }, 'name').lean();
  return new Map(families.map((f) => [String(f._id), f.name]));
}

/**
 * Every ACTIVE membership for a user, newest-owned-first — backs GET /auth/me and the
 * `memberships` array returned by login/google-sign-in/accept-invite (an existing person's full
 * family list, not just whatever this one request happened to auto-join).
 */
export async function loadMembershipSummaries(userId) {
  const memberships = await Membership.find({ userId, status: 'active' }).sort({ isOwner: -1, createdAt: 1 });
  if (!memberships.length) return [];
  const nameById = await familyNamesById(memberships.map((m) => m.familyId));
  return summarizeMemberships(memberships, nameById);
}

/**
 * Multi-family auto-join (docs/API.md "Multi-family sessions", docs/DECISIONS.md "Multi-family
 * accounts"): called right after a User is identified/created by signup, login, the Google
 * sign-in/complete flow, and POST /auth/accept-invite. Resolves every pending invite this
 * identity can now claim, in the SAME request, no click-through required:
 *
 *  1. `Membership{ invitedEmail: user.email, userId: null, status: 'invited' }` — a standing
 *     offer left by POST /members for an email with no account yet (see members/routes.js). Link
 *     `userId` + flip to `active`, per the exact update docs/DECISIONS.md specifies.
 *  2. `Membership{ userId: user._id, status: 'invited' }` — POST /members' OTHER shape, for an
 *     email that already had a User account when invited (member of another family, or already
 *     signed up independently): the Membership is created pointing straight at that `userId` but
 *     stays `'invited'` until "the moment they next log in (any method)" per docs/API.md's
 *     POST /members — this is that moment.
 *
 * Returns the newly-activated memberships in the same `{id, familyId, familyName, role, access,
 * isOwner, status}` shape as `loadMembershipSummaries`, and fires the same `invite_accepted`
 * activity/admin-alert `loadActiveMembershipOrThrow` used to fire in the old single-family model.
 */
export async function autoJoinPendingInvites(user, req) {
  const byInvitedEmail = await Membership.find(
    { invitedEmail: user.email, userId: null, status: 'invited' },
    '_id',
  ).lean();
  if (byInvitedEmail.length) {
    await Membership.updateMany(
      { _id: { $in: byInvitedEmail.map((m) => m._id) } },
      { $set: { userId: user._id, status: 'active' }, $unset: { invitedEmail: 1 } },
    );
  }

  const byUserId = await Membership.find({ userId: user._id, status: 'invited' }, '_id').lean();
  if (byUserId.length) {
    await Membership.updateMany({ _id: { $in: byUserId.map((m) => m._id) } }, { $set: { status: 'active' } });
  }

  const activatedIds = [...byInvitedEmail, ...byUserId].map((m) => m._id);
  if (!activatedIds.length) return [];

  const activated = await Membership.find({ _id: { $in: activatedIds } });
  const nameById = await familyNamesById(activated.map((m) => m.familyId));

  for (const membership of activated) {
    // eslint-disable-next-line no-await-in-loop
    await logActivity(reqCtx(req), {
      action: 'member.access_change',
      targetType: 'membership',
      targetId: membership._id,
      familyId: membership.familyId,
      actorName: membership.name,
      meta: { event: 'invite_accepted' },
    });
  }

  return summarizeMemberships(activated, nameById);
}

/**
 * POST /auth/signup — creates ONLY the User (multi-family: no Family/Membership created here
 * anymore, see docs/DECISIONS.md "Multi-family accounts"), then auto-joins any pending invite for
 * this email.
 *
 * Also reused by POST /auth/google/complete (googleService.js): pass `googleIdentity:
 * { googleId, avatarUrl }` instead of `password` to create a Google-only user (no passwordHash,
 * `authProviders: ['google']`) rather than a password-based one. Exactly one of
 * `password`/`googleIdentity` is expected — callers are responsible for that, this function just
 * branches on which is present (and, correspondingly, which half of the global login-method gate
 * applies).
 */
export async function signup({ name, email, password, googleIdentity }, req) {
  await assertLoginMethodAllowed(googleIdentity ? 'google' : 'password');

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

  const userDoc = { name, email: normalizedEmail, lastLoginAt: new Date() };
  if (googleIdentity) {
    userDoc.googleId = googleIdentity.googleId;
    userDoc.avatarUrl = googleIdentity.avatarUrl || null;
    userDoc.authProviders = ['google'];
  } else {
    userDoc.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  }
  const user = await User.create(userDoc);

  const memberships = await autoJoinPendingInvites(user, req);

  const { accessToken, refreshToken } = await tokenService.issueTokenPair({
    userId: user._id,
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });

  // Best-effort: a cold signup (no auto-joined family) has nothing to scope this log to —
  // logActivity drops it gracefully (console.warn) in that case, same as any other
  // familyId-less call site.
  await logActivity(reqCtx(req), {
    action: 'auth.signup',
    targetType: 'user',
    targetId: user._id,
    familyId: memberships[0]?.familyId,
    actorName: name,
  });

  return { user, memberships, accessToken, refreshToken };
}

/**
 * Best-effort failed-login log — scoped to whichever family the email happens to belong to (any
 * one of them; this is purely so the "N failed logins" admin alert has something to count), never
 * lets a logging failure affect the login response either way.
 */
async function logFailedLoginAttempt(user, req) {
  if (!user) return;
  try {
    const membership = await Membership.findOne({ userId: user._id }).sort({ isOwner: -1, createdAt: 1 });
    await logActivity(reqCtx(req), {
      action: 'auth.login_failed',
      targetType: 'user',
      targetId: user._id,
      familyId: membership?.familyId,
      actorName: membership?.name || user.name,
      meta: { method: 'password' },
    });
  } catch {
    // Best-effort only — must never affect the login response.
  }
}

/**
 * POST /auth/login — multi-family: sign-in no longer requires (or even looks at) any ONE
 * membership. `user.disabled` is the only account-level kill switch; a per-family
 * `Membership.status: 'disabled'` only blocks access to THAT family (enforced by
 * requireAuth/requireFamily on family-scoped routes), it does not block login itself — a user
 * disabled out of one family may still be a member of another. Runs auto-join first (an admin may
 * have invited this email after the account already existed) so the returned `memberships` is
 * this user's complete, current, active list.
 */
export async function login({ email, password }, req) {
  await assertLoginMethodAllowed('password');

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  // A Google-only user has `passwordHash: null` — bcrypt.compare() throws (not "returns false")
  // when handed a non-string hash, so this must short-circuit BEFORE calling compare(), and it
  // must fail with the same generic INVALID_CREDENTIALS as a wrong password, never a different
  // status/code that would leak "this account exists but has no password set".
  const passwordOk = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !passwordOk) {
    await logFailedLoginAttempt(user, req);
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (user.disabled) {
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  await autoJoinPendingInvites(user, req);
  const memberships = await loadMembershipSummaries(user._id);

  user.lastLoginAt = new Date();
  await user.save();

  const { accessToken, refreshToken } = await tokenService.issueTokenPair({
    userId: user._id,
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });

  await logActivity(reqCtx(req), {
    action: 'auth.login',
    targetType: 'user',
    targetId: user._id,
    familyId: memberships[0]?.familyId,
    actorName: user.name,
    meta: { method: 'password' },
  });

  return { user, memberships, accessToken, refreshToken };
}

/** POST /auth/refresh */
export async function refresh(rawToken, req) {
  return tokenService.rotateRefreshToken(rawToken, {
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });
}

/** POST /auth/logout */
export async function logout(rawToken, req) {
  await tokenService.revokeRefreshToken(rawToken);
  if (req?.auth) {
    await logActivity(req, { action: 'auth.logout' });
  }
}

/** POST /auth/logout-all */
export async function logoutAll(userId, req) {
  await tokenService.revokeAllRefreshTokensForUser(userId);
  await logActivity(req, { action: 'auth.logout_all', targetType: 'user', targetId: userId });
}

/**
 * GET /auth/me — family-agnostic (no X-Family-Id needed). Returns the user plus their FULL
 * active-membership list so the client can build a family switcher without extra calls.
 */
export async function getMe(auth) {
  const user = await User.findById(auth.userId);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'Account not found');

  const memberships = await loadMembershipSummaries(user._id);

  return {
    user: serializeUser(user),
    memberships,
  };
}

/** PATCH /auth/me */
export async function updateMe(userId, patch) {
  const update = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.avatarColor !== undefined) update.avatarColor = patch.avatarColor;
  if (patch.language !== undefined) update.language = patch.language;

  const user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  return user;
}

/** POST /auth/change-password */
export async function changePassword(userId, { currentPassword, newPassword }, req) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');

  // Same null-passwordHash guard as login() — a Google-only user has nothing to compare against.
  if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ApiError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await user.save();

  // Defensive: a changed password invalidates every existing refresh token (forces re-login on
  // every other device/session), same security posture as a member password reset by an admin.
  await tokenService.revokeAllRefreshTokensForUser(userId);

  await logActivity(req, { action: 'auth.change_password', targetType: 'user', targetId: userId });
}

/**
 * POST /auth/set-password — lets a Google-only account add its first password (it has no current
 * password to re-enter, so there is nothing to verify beyond the signed-in session). An account
 * that already has a password must go through POST /auth/change-password, which checks the
 * current one — otherwise anyone holding a live session could silently replace it.
 */
export async function setPassword(userId, newPassword, req) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  if (user.passwordHash) {
    throw new ApiError(409, 'PASSWORD_ALREADY_SET', 'This account already has a password — change it instead');
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  if (!user.authProviders.includes('password')) user.authProviders.push('password');
  await user.save();

  await logActivity(req, { action: 'auth.set_password', targetType: 'user', targetId: userId });
}

// ---------- Email module: forgot password / reset password / accept invite ----------

const RESET_TOKEN_MINUTES = 30;

/**
 * POST /auth/forgot-password — ALWAYS resolves the same way regardless of whether the account
 * exists (the controller always sends a generic 200 — see controller.js). Only `user.disabled`
 * blocks it (multi-family: a per-family `Membership.status: 'disabled'` no longer implies the
 * account itself can't reset its own password — see login()'s comment for the same reasoning).
 */
export async function forgotPassword({ email }, req) {
  // No password resets while the platform is Google-only — there'd be nothing to sign in with.
  await assertLoginMethodAllowed('password');
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user || user.disabled) return;

  const raw = await mintPasswordResetToken({ userId: user._id }, 'reset');
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${raw}`;
  const email_ = emailTemplates.passwordResetEmail({ name: user.name, resetUrl, expiresInMinutes: RESET_TOKEN_MINUTES });
  sendMail({ to: user.email, subject: email_.subject, html: email_.html, text: email_.text });

  const membership = await Membership.findOne({ userId: user._id }).sort({ isOwner: -1, createdAt: 1 });
  await logActivity(reqCtx(req), {
    action: 'auth.forgot_password',
    targetType: 'user',
    targetId: user._id,
    familyId: membership?.familyId,
    actorName: membership?.name || user.name,
  });
}

/**
 * POST /auth/reset-password — sets a new password (adding 'password' to `authProviders` if it
 * was missing, covering a Google-only user setting a password this way too), revokes EVERY
 * refresh token for the user (logs out every device/session), and emails a confirmation.
 */
export async function resetPassword({ token, newPassword }, req) {
  await assertLoginMethodAllowed('password');
  const tokenDoc = await findValidPasswordResetToken(token, 'reset');
  if (!tokenDoc) throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This reset link is invalid or has expired');

  const user = await User.findById(tokenDoc.userId);
  if (!user) throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This reset link is invalid or has expired');

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  if (!user.authProviders.includes('password')) user.authProviders.push('password');
  await user.save();

  tokenDoc.usedAt = new Date();
  await tokenDoc.save();

  await tokenService.revokeAllRefreshTokensForUser(user._id);

  const email_ = emailTemplates.passwordChangedEmail({ name: user.name });
  sendMail({ to: user.email, subject: email_.subject, html: email_.html, text: email_.text });

  const membership = await Membership.findOne({ userId: user._id }).sort({ isOwner: -1, createdAt: 1 });
  await logActivity(reqCtx(req), {
    action: 'auth.reset_password',
    targetType: 'user',
    targetId: user._id,
    familyId: membership?.familyId,
    actorName: membership?.name,
  });
}

/**
 * GET /auth/accept-invite/:token — lets the client show "Join <family>" / offer a Google option
 * BEFORE the invitee submits anything.
 *
 * Multi-family (docs/DECISIONS.md "Multi-family accounts"): an invite token is always tied to a
 * specific `Membership` (`membershipId`), never a `userId` — a user can hold several simultaneous
 * pending invites, so `userId` alone can't say which one a given link is for (see
 * services/passwordResetTokens.js). Two shapes of Membership can be behind the token:
 *  - `userId: null, invitedEmail` — a genuinely new person, no User row yet. `accountExists:
 *    false`.
 *  - `userId` already set (POST /members' "found an existing User for that email" case) —
 *    `accountExists: true`, the client should show "log in to join" instead of a password form.
 */
export async function getInviteContext(rawToken) {
  const tokenDoc = await findValidPasswordResetToken(rawToken, 'invite');
  if (!tokenDoc?.membershipId) {
    throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite link is invalid or has expired');
  }

  const membership = await Membership.findById(tokenDoc.membershipId);
  if (!membership) throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite link is invalid or has expired');

  const family = await Family.findById(membership.familyId).select('name').lean();

  if (membership.userId) {
    const user = await User.findById(membership.userId).select('email authProviders').lean();
    if (!user) throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite link is invalid or has expired');
    return {
      email: user.email,
      familyName: family?.name || '',
      allowsGoogle: (user.authProviders || []).includes('google'),
      accountExists: true,
    };
  }

  return {
    email: membership.invitedEmail,
    familyName: family?.name || '',
    allowsGoogle: membership.invitedLoginMethod === 'google' || membership.invitedLoginMethod === 'both',
    accountExists: false,
  };
}

/**
 * POST /auth/accept-invite — the password-set path for a member invited by email (see
 * docs/API.md POST /members). Only valid for a genuinely NEW person (no `User` exists yet for the
 * invited email) — creates that User (with the given password) and, via `autoJoinPendingInvites`,
 * links+activates this Membership (and any other pending invite for this same email, in one go).
 *
 * If a `User` already exists for this email (`membership.userId` already set — POST /members'
 * "found" shape), this endpoint refuses with `409 ACCOUNT_EXISTS`: letting an unauthenticated
 * invite-token request set a NEW password on an EXISTING account would be an account-takeover
 * path (docs/DECISIONS.md "Multi-family accounts"). The client should point them at login instead
 * — the same auto-join mechanism activates the membership there.
 */
export async function acceptInvite({ token, password }, req) {
  // Accepting an invite with a password creates a password account AND signs the person in, so it
  // must obey the platform's sign-in policy exactly like signup/login (Google invites go through
  // the Google sign-in flow, which checks 'google').
  await assertLoginMethodAllowed('password');
  const tokenDoc = await findValidPasswordResetToken(token, 'invite');
  if (!tokenDoc?.membershipId) {
    throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite link is invalid or has expired');
  }

  const membership = await Membership.findById(tokenDoc.membershipId);
  if (!membership) throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite link is invalid or has expired');
  if (membership.status !== 'invited') {
    throw new ApiError(409, 'ALREADY_ACCEPTED', 'This invite has already been accepted');
  }
  if (membership.userId) {
    throw new ApiError(409, 'ACCOUNT_EXISTS', 'An account already exists for this email — log in instead');
  }
  if (!membership.invitedEmail) {
    throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite link is invalid or has expired');
  }

  // Defensive: someone may have signed up with this exact email through another path since the
  // invite was minted (a race, not the normal flow) — same ACCOUNT_EXISTS response either way.
  const existingUser = await User.findOne({ email: membership.invitedEmail });
  if (existingUser) {
    throw new ApiError(409, 'ACCOUNT_EXISTS', 'An account already exists for this email — log in instead');
  }

  if (!password) {
    throw new ApiError(400, 'PASSWORD_REQUIRED', 'Set a password (or sign in with Google) to accept this invite');
  }

  const authProviders = new Set(['password']);
  if (membership.invitedLoginMethod === 'google' || membership.invitedLoginMethod === 'both') {
    authProviders.add('google');
  }

  const user = await User.create({
    name: membership.name,
    email: membership.invitedEmail,
    passwordHash: await bcrypt.hash(password, BCRYPT_COST),
    authProviders: [...authProviders],
    lastLoginAt: new Date(),
  });

  // Activates THIS membership (matches by invitedEmail/userId:null) and any other pending invite
  // for the same email, all in one request — same mechanism as signup/login.
  const memberships = await autoJoinPendingInvites(user, req);

  tokenDoc.usedAt = new Date();
  await tokenDoc.save();

  const { accessToken, refreshToken } = await tokenService.issueTokenPair({
    userId: user._id,
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });

  return { user, memberships, accessToken, refreshToken };
}
