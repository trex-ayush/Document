import { User } from '../../models/User.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import * as tokenService from './tokenService.js';
import {
  signup as createUser,
  autoJoinPendingInvites,
  loadMembershipSummaries,
  assertLoginMethodAllowed,
  reqCtx,
} from './service.js';
import {
  assertGoogleEnabled,
  verifyGoogleCredential,
  signGoogleSignupToken,
  verifyGoogleSignupToken,
} from './googleClient.js';

/** Issue the exact POST /auth/login session shape for an already-identified, already-checked user. */
async function issueLoginSession(user, req) {
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
    meta: { method: 'google' },
  });

  return { user, memberships, accessToken, refreshToken };
}

/**
 * POST /auth/google — sign in (or begin sign-up) with a verified Google ID token.
 *
 * Resolution order: by `googleId` first (the common case for a returning Google user), then by
 * email (first-ever Google sign-in for an email that already has a User row — either a
 * password-only account linking Google, or a member invited with `loginMethod: 'google'`/`'both'`
 * whose User row exists but has never had a googleId). Neither match: returns
 * `{ needsSignup: true, signupToken, profile }` — nothing is created here. Multi-family: the
 * "found" branch never depends on any ONE membership (see `issueLoginSession` above) — only
 * `user.disabled` gates it, same as password login.
 */
export async function googleSignIn({ credential }, req) {
  assertGoogleEnabled();
  await assertLoginMethodAllowed('google');
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

  if (user.disabled) {
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  const session = await issueLoginSession(user, req);
  return { needsSignup: false, ...session };
}

/**
 * POST /auth/google/complete — the second step for a brand-new Google identity (no matching
 * googleId/email found by POST /auth/google). Creates ONLY the User (multi-family: no Family
 * anymore — see docs/DECISIONS.md), via the SAME service function POST /auth/signup uses, just
 * with a pre-verified Google identity instead of a password.
 *
 * The global login-method gate is checked HERE, at the very top (before `signupToken` is even
 * verified) — `createUser` (aliased from `signup()`) also runs `assertLoginMethodAllowed('google')`
 * internally, but only after a valid token, so relying on that alone would fail a *disabled*
 * token with 401 SIGNUP_TOKEN_INVALID before ever getting a chance to report 403
 * LOGIN_METHOD_NOT_ALLOWED — the policy gate should win regardless of token validity.
 */
export async function googleComplete({ signupToken }, req) {
  assertGoogleEnabled();
  await assertLoginMethodAllowed('google');
  const payload = verifyGoogleSignupToken(signupToken);

  return createUser(
    {
      name: payload.name,
      email: payload.email,
      googleIdentity: { googleId: payload.sub, avatarUrl: payload.avatarUrl || null },
    },
    req,
  );
}
