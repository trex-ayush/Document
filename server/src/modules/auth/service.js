import bcrypt from 'bcryptjs';

import { User } from '../../models/User.js';
import { Family } from '../../models/Family.js';
import { Membership } from '../../models/Membership.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { signReauthToken } from '../../utils/tokens.js';
import { seedFamilyDefaults } from '../../seed/seedFamilyDefaults.js';
import * as tokenService from './tokenService.js';
import { serializeUser, serializeMembership, serializeFamily } from './serializers.js';
import { verifyGoogleCredential } from './googleClient.js';
import { env } from '../../config/env.js';
import { sendMail } from '../../services/mailer.js';
import * as emailTemplates from '../../services/emailTemplates.js';
import { mintPasswordResetToken, findValidPasswordResetToken } from '../../services/passwordResetTokens.js';

const BCRYPT_COST = 12;

function slugify(input) {
  return (
    input
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'family'
  );
}

async function generateUniqueSlug(name) {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Family.exists({ slug })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

export function reqCtx(req) {
  // logActivity accepts either a real Express req or this minimal shape. Exported so
  // googleService.js (pre-auth Google sign-in/signup, same situation as password
  // signup/login below — no req.auth yet) can log activity the same way.
  return { headers: req?.headers, ip: req?.ip, socket: req?.socket };
}

/**
 * Shared by password login and Google sign-in (googleService.js): given an already-identified
 * User, applies the same disabled-user / disabled-membership checks either sign-in method must
 * enforce before issuing a session, and returns that user's (owner-preferred) active Membership.
 * `User.disabled` mirrors `Membership.status === 'disabled'` as a belt-and-braces account-level
 * kill switch — both are enforced here so neither sign-in path can diverge.
 */
export async function loadActiveMembershipOrThrow(user, req) {
  if (user.disabled) {
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  const membership = await Membership.findOne({ userId: user._id }).sort({ isOwner: -1, createdAt: 1 });
  if (!membership) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (membership.status === 'disabled') {
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  // Email module: a member invited by email (status: 'invited') who completes sign-in via
  // Google — rather than POST /auth/accept-invite's password-set path — has just as validly
  // "accepted" the invite: Google already proved their identity. Flip them active here so
  // Membership.status never gets stuck on 'invited' for someone who can, in practice, already
  // sign in, and fire the same invite-accepted admin alert either way (see
  // services/alerts.js's `member.access_change` / `meta.event: 'invite_accepted'` handling).
  // In practice this only triggers from the Google sign-in path — a password login can never
  // reach this far for an invited member, since `login()` below rejects a null `passwordHash`
  // before ever calling this function.
  if (membership.status === 'invited') {
    membership.status = 'active';
    await membership.save();
    await logActivity(reqCtx(req), {
      action: 'member.access_change',
      targetType: 'membership',
      targetId: membership._id,
      familyId: membership.familyId,
      actorName: membership.name,
      meta: { event: 'invite_accepted' },
    });
  }

  return membership;
}

/**
 * POST /auth/signup — creates Family + owning User + admin Membership, seeds defaults.
 *
 * Also reused by POST /auth/google/complete (googleService.js): pass `googleIdentity:
 * { googleId, avatarUrl }` instead of `password` to create a Google-only owner (no
 * passwordHash, `authProviders: ['google']`) rather than a password-based one. Exactly one of
 * `password`/`googleIdentity` is expected — callers are responsible for that, this function just
 * branches on which is present.
 */
export async function signup({ familyName, name, email, password, googleIdentity }, req) {
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

  const slug = await generateUniqueSlug(familyName);
  const family = await Family.create({ name: familyName, slug, createdBy: user._id });

  const membership = await Membership.create({
    familyId: family._id,
    userId: user._id,
    name,
    role: 'admin',
    access: 'write',
    canLogin: true,
    isOwner: true,
    status: 'active',
  });

  await seedFamilyDefaults({ familyId: family._id, membershipId: membership._id });

  const { accessToken, refreshToken } = await tokenService.issueTokenPair({
    userId: user._id,
    familyId: family._id,
    membershipId: membership._id,
    role: membership.role,
    access: membership.access,
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });

  await logActivity(reqCtx(req), {
    action: 'auth.signup',
    targetType: 'family',
    targetId: family._id,
    familyId: family._id,
    actorName: name,
  });

  return { user, membership, family, accessToken, refreshToken };
}

/**
 * Email module: best-effort activity log for a failed password login, scoped to the user's
 * family so the "5+ failed logins in 15 minutes" admin alert (services/alerts.js) has something
 * to count. Only for a KNOWN email (a familyId is required to log anything at all) — an unknown
 * email never gets a log entry, so this can't be used to distinguish "wrong password" from
 * "no such account" from the outside (the HTTP response is identical either way regardless).
 */
async function logFailedLoginAttempt(user, req) {
  if (!user) return;
  try {
    const membership = await Membership.findOne({ userId: user._id }).sort({ isOwner: -1, createdAt: 1 });
    if (!membership) return;
    await logActivity(reqCtx(req), {
      action: 'auth.login_failed',
      targetType: 'user',
      targetId: user._id,
      familyId: membership.familyId,
      actorName: membership.name,
      meta: { method: 'password' },
    });
  } catch {
    // Best-effort only — must never affect the login response.
  }
}

/** POST /auth/login */
export async function login({ email, password }, req) {
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

  const membership = await loadActiveMembershipOrThrow(user, req);
  const family = await Family.findById(membership.familyId);

  user.lastLoginAt = new Date();
  await user.save();

  const { accessToken, refreshToken } = await tokenService.issueTokenPair({
    userId: user._id,
    familyId: membership.familyId,
    membershipId: membership._id,
    role: membership.role,
    access: membership.access,
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });

  await logActivity(reqCtx(req), {
    action: 'auth.login',
    targetType: 'user',
    targetId: user._id,
    familyId: membership.familyId,
    actorName: membership.name,
    meta: { method: 'password' },
  });

  return { user, membership, family, accessToken, refreshToken };
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

/** GET /auth/me — returns already-serialized {user, membership, family}. */
export async function getMe(auth) {
  const [user, family] = await Promise.all([User.findById(auth.userId), Family.findById(auth.familyId)]);
  if (!user || !family) throw new ApiError(404, 'NOT_FOUND', 'Account not found');

  return {
    user: serializeUser(user),
    membership: serializeMembership(auth.membership, { userEmail: user.email }),
    family: serializeFamily(family),
  };
}

/** PATCH /auth/me */
export async function updateMe(userId, patch) {
  const update = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.avatarColor !== undefined) update.avatarColor = patch.avatarColor;

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

const REAUTH_CREDENTIAL_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * POST /auth/reauth — proves "you just now proved your identity", either by re-entering the
 * current password (`{ password }`, the original behavior) or by presenting a *fresh* Google ID
 * token (`{ credential }`) for the account's ALREADY-linked Google identity. The credential path
 * never links a new Google account here (that's POST /auth/google/link) — it only accepts a
 * token whose `sub` matches `user.googleId`, and whose `iat` is within the last 5 minutes, so an
 * old-but-still-technically-valid Google ID token can't be replayed to satisfy a reauth prompt.
 * Either path returns the same `{ reauthToken }` shape.
 */
export async function reauth(auth, { password, credential }, req) {
  const user = await User.findById(auth.userId);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');

  let method;
  if (credential) {
    const payload = await verifyGoogleCredential(credential);
    if (!user.googleId || payload.sub !== user.googleId) {
      throw new ApiError(401, 'GOOGLE_REAUTH_INVALID', 'Google credential does not match the linked account');
    }
    const iatMs = Number(payload.iat) * 1000;
    if (!Number.isFinite(iatMs) || Date.now() - iatMs > REAUTH_CREDENTIAL_MAX_AGE_MS) {
      throw new ApiError(401, 'GOOGLE_REAUTH_INVALID', 'Google credential is stale — sign in again');
    }
    method = 'google';
  } else {
    if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new ApiError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    }
    method = 'password';
  }

  const reauthToken = signReauthToken({ membershipId: auth.membershipId, familyId: auth.familyId });

  await logActivity(req, {
    action: 'auth.reauth',
    targetType: 'membership',
    targetId: auth.membershipId,
    meta: { method },
  });

  return { reauthToken };
}

/**
 * POST /auth/set-password — auth required + a fresh `X-Reauth` header (see routes.js's
 * `requireFreshReauth`). Lets a Google-only user (or anyone) add/replace a password without
 * knowing a "current password" that may not exist — the reauth token already proved identity.
 */
export async function setPassword(userId, newPassword, req) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  if (!user.authProviders.includes('password')) user.authProviders.push('password');
  await user.save();

  await logActivity(req, { action: 'auth.set_password', targetType: 'user', targetId: userId });
}

// ---------- Email module: forgot password / reset password / accept invite ----------

const RESET_TOKEN_MINUTES = 30;

/**
 * POST /auth/forgot-password — ALWAYS resolves the same way regardless of whether the account
 * exists (the controller always sends a generic 200 — see controller.js). A disabled user (or
 * one whose membership is disabled) silently gets no email either, for the same reason.
 */
export async function forgotPassword({ email }, req) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user || user.disabled) return;

  const membership = await Membership.findOne({ userId: user._id }).sort({ isOwner: -1, createdAt: 1 });
  if (!membership || membership.status === 'disabled') return;

  const raw = await mintPasswordResetToken(user._id, 'reset');
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${raw}`;
  const email_ = emailTemplates.passwordResetEmail({ name: user.name, resetUrl, expiresInMinutes: RESET_TOKEN_MINUTES });
  sendMail({ to: user.email, subject: email_.subject, html: email_.html, text: email_.text });

  await logActivity(reqCtx(req), {
    action: 'auth.forgot_password',
    targetType: 'user',
    targetId: user._id,
    familyId: membership.familyId,
    actorName: membership.name,
  });
}

/**
 * POST /auth/reset-password — sets a new password (adding 'password' to `authProviders` if it
 * was missing, covering a Google-only user setting a password this way too), revokes EVERY
 * refresh token for the user (logs out every device/session), and emails a confirmation.
 */
export async function resetPassword({ token, newPassword }, req) {
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
 * BEFORE the invitee submits anything. `allowsGoogle` reflects whether the admin's invite allowed
 * Google sign-in (`loginMethod: 'google'|'both'` at invite time — see members/routes.js), i.e.
 * whether `authProviders` includes `'google'` on the not-yet-linked User row.
 */
export async function getInviteContext(rawToken) {
  const tokenDoc = await findValidPasswordResetToken(rawToken, 'invite');
  if (!tokenDoc) throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite link is invalid or has expired');

  const user = await User.findById(tokenDoc.userId).select('email authProviders').lean();
  if (!user) throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite link is invalid or has expired');

  const membership = await Membership.findOne({ userId: user._id }).lean();
  const family = membership ? await Family.findById(membership.familyId).select('name').lean() : null;

  return {
    email: user.email,
    familyName: family?.name || '',
    allowsGoogle: (user.authProviders || []).includes('google'),
  };
}

/**
 * POST /auth/accept-invite — the password-set path for a member invited by email (see
 * docs/API.md POST /members). `password` is optional: an invitee whose invite `allowsGoogle` may
 * instead complete entirely via POST /auth/google (see `loadActiveMembershipOrThrow` above) —
 * this endpoint errors if called with neither a password nor an already-linked Google identity,
 * since there'd be nothing to authenticate with afterwards.
 *
 * Sets the password (if provided), flips the Membership to 'active', marks the invite token
 * used, logs a `member.access_change` activity (`meta.event: 'invite_accepted'`) so the admin
 * alert fires, and returns a full session (same shape as signup/login) so the client can sign the
 * new member straight in.
 */
export async function acceptInvite({ token, password }, req) {
  const tokenDoc = await findValidPasswordResetToken(token, 'invite');
  if (!tokenDoc) throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite link is invalid or has expired');

  const user = await User.findById(tokenDoc.userId);
  if (!user) throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite link is invalid or has expired');

  const membership = await Membership.findOne({ userId: user._id });
  if (!membership) throw new ApiError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This invite is no longer valid');
  if (membership.status !== 'invited') {
    throw new ApiError(409, 'ALREADY_ACCEPTED', 'This invite has already been accepted');
  }

  if (password) {
    user.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    if (!user.authProviders.includes('password')) user.authProviders.push('password');
    await user.save();
  } else if (!user.passwordHash && !user.googleId) {
    throw new ApiError(400, 'PASSWORD_REQUIRED', 'Set a password (or sign in with Google) to accept this invite');
  }

  membership.status = 'active';
  await membership.save();

  tokenDoc.usedAt = new Date();
  await tokenDoc.save();

  await logActivity(reqCtx(req), {
    action: 'member.access_change',
    targetType: 'membership',
    targetId: membership._id,
    familyId: membership.familyId,
    actorName: membership.name,
    meta: { event: 'invite_accepted' },
  });

  const family = await Family.findById(membership.familyId);
  const { accessToken, refreshToken } = await tokenService.issueTokenPair({
    userId: user._id,
    familyId: membership.familyId,
    membershipId: membership._id,
    role: membership.role,
    access: membership.access,
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });

  return { user, membership, family, accessToken, refreshToken };
}
