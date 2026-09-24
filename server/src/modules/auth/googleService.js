import { User } from '../../models/User.js';
import { Family } from '../../models/Family.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import * as tokenService from './tokenService.js';
import { signup as createFamilyAndOwner, loadActiveMembershipOrThrow, reqCtx } from './service.js';
import {
  assertGoogleEnabled,
  verifyGoogleCredential,
  signGoogleSignupToken,
  verifyGoogleSignupToken,
} from './googleClient.js';

/** Issue the exact POST /auth/login session shape for an already-identified, already-checked user. */
async function issueLoginSession(user, membership, req) {
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
    meta: { method: 'google' },
  });

  return { user, membership, family, accessToken, refreshToken };
}

/**
 * POST /auth/google — sign in (or begin sign-up) with a verified Google ID token.
 *
 * Resolution order: by `googleId` first (the common case for a returning Google user), then by
 * email (first-ever Google sign-in for an email that already has a User row — either a
 * password-only account linking Google, or a member invited with `loginMethod: 'google'`/`'both'`
 * whose User row exists but has never had a googleId). Neither match: returns
 * `{ needsSignup: true, signupToken, profile }` — nothing is created here. Joining an existing
 * family only ever happens because an admin already created that Membership+User via POST
 * /members; this endpoint never auto-joins a family by email match alone.
 */
export async function googleSignIn({ credential }, req) {
  assertGoogleEnabled();
  const payload = await verifyGoogleCredential(credential);
  const email = String(payload.email).toLowerCase().trim();

  let user = await User.findOne({ googleId: payload.sub });

  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      // Found by email but not yet linked to this Google identity — link it.
      user.googleId = payload.sub;
      if (!user.authProviders.includes('google')) user.authProviders.push('google');
      if (!user.avatarUrl && payload.picture) user.avatarUrl = payload.picture;
      await user.save();
    }
  }

  if (!user) {
    const signupToken = signGoogleSignupToken({
      email,
      name: payload.name || email,
      avatarUrl: payload.picture || null,
      sub: payload.sub,
    });
    return {
      needsSignup: true,
      signupToken,
      profile: { name: payload.name || email, email, avatarUrl: payload.picture || null },
    };
  }

  const membership = await loadActiveMembershipOrThrow(user, req);
  const session = await issueLoginSession(user, membership, req);
  return { needsSignup: false, ...session };
}

/**
 * POST /auth/google/complete — the second step for a brand-new Google identity (no matching
 * googleId/email found by POST /auth/google). Creates the Family + owning User + admin
 * Membership + seeded defaults via the SAME service function POST /auth/signup uses, just with a
 * pre-verified Google identity instead of a password.
 */
export async function googleComplete({ signupToken, familyName }, req) {
  assertGoogleEnabled();
  const payload = verifyGoogleSignupToken(signupToken);

  return createFamilyAndOwner(
    {
      familyName,
      name: payload.name,
      email: payload.email,
      googleIdentity: { googleId: payload.sub, avatarUrl: payload.avatarUrl || null },
    },
    req,
  );
}

/**
 * POST /auth/google/link — auth required. Links a Google identity to the CURRENTLY
 * authenticated account. Unlike POST /auth/google, the token's email need not match the
 * account's email — this is an explicit "link this Google identity to me" action, not an
 * identity match.
 */
export async function googleLink(auth, { credential }, req) {
  assertGoogleEnabled();
  const payload = await verifyGoogleCredential(credential);

  const user = await User.findById(auth.userId);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');

  const owner = await User.findOne({ googleId: payload.sub });
  if (owner && String(owner._id) !== String(user._id)) {
    throw new ApiError(409, 'GOOGLE_ACCOUNT_ALREADY_LINKED', 'This Google account is already linked to a different user');
  }

  user.googleId = payload.sub;
  if (!user.authProviders.includes('google')) user.authProviders.push('google');
  if (!user.avatarUrl && payload.picture) user.avatarUrl = payload.picture;
  await user.save();

  await logActivity(req, { action: 'auth.google_link', targetType: 'user', targetId: user._id });

  return { user };
}

/**
 * POST /auth/google/unlink — auth required. Refuses to leave the account with zero usable
 * sign-in methods: only allowed once a passwordHash is set.
 */
export async function googleUnlink(auth, req) {
  assertGoogleEnabled();
  const user = await User.findById(auth.userId);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');

  if (!user.passwordHash) {
    throw new ApiError(400, 'CANNOT_UNLINK_ONLY_METHOD', 'Set a password before unlinking Google sign-in');
  }

  user.googleId = null;
  user.authProviders = user.authProviders.filter((p) => p !== 'google');
  await user.save();

  await logActivity(req, { action: 'auth.google_unlink', targetType: 'user', targetId: user._id });

  return { user };
}
