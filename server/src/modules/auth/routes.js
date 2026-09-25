import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { verifyReauthToken } from '../../utils/tokens.js';
import * as schemas from './schemas.js';
import * as controller from './controller.js';
import { loginLimiter, signupLimiter, reauthLimiter, googleLimiter, forgotPasswordLimiter } from './rateLimiters.js';

const router = express.Router();

/**
 * Guards POST /auth/set-password: requires a fresh `X-Reauth` token (from POST /auth/reauth)
 * scoped to the SAME membership+family as the caller's access token — same verification pattern
 * as the documents module's field-reveal endpoint (see `verifyReauthToken` usages).
 *
 * Multi-family: both POST /auth/reauth and POST /auth/set-password are family-agnostic (no
 * X-Family-Id required — docs/API.md "Multi-family sessions"), so for a caller with no resolved
 * family `req.auth.membershipId`/`familyId` are genuine `null`. `signReauthToken`
 * (utils/tokens.js, out of this agent's ownership) unconditionally `String()`s both fields when
 * signing, so a `null` comes back out of `verifyReauthToken` as the STRING `"null"`, not actual
 * `null` — normalize both sides through the same stringify-or-null shape before comparing, or a
 * cold (family-less) caller's own reauth token would never match their own request.
 */
function normalizeReauthSubject(value) {
  return value === null || value === undefined || value === 'null' ? null : String(value);
}

function requireFreshReauth(req, res, next) {
  try {
    const header = req.headers['x-reauth'];
    if (!header) throw new Error('missing');
    const reauth = verifyReauthToken(header);
    if (
      normalizeReauthSubject(reauth.membershipId) !== normalizeReauthSubject(req.auth.membershipId) ||
      normalizeReauthSubject(reauth.familyId) !== normalizeReauthSubject(req.auth.familyId)
    ) {
      throw new Error('mismatch');
    }
    next();
  } catch {
    next(new ApiError(401, 'REAUTH_REQUIRED', 'Re-authentication required'));
  }
}

router.post('/signup', signupLimiter, validate({ body: schemas.signupSchema }), controller.signup);
router.post('/login', loginLimiter, validate({ body: schemas.loginSchema }), controller.login);
router.post('/refresh', validate({ body: schemas.refreshSchema }), controller.refresh);

router.post('/logout', requireAuth, validate({ body: schemas.refreshSchema }), controller.logout);
router.post('/logout-all', requireAuth, controller.logoutAll);

router.get('/me', requireAuth, controller.me);
router.patch('/me', requireAuth, validate({ body: schemas.patchMeSchema }), controller.patchMe);

router.post(
  '/change-password',
  requireAuth,
  validate({ body: schemas.changePasswordSchema }),
  controller.changePassword,
);

router.post(
  '/reauth',
  requireAuth,
  reauthLimiter,
  validate({ body: schemas.reauthSchema }),
  controller.reauth,
);

// ---------- Google sign-in (docs/DECISIONS.md "Google sign-in") ----------
// Every route's service function checks GOOGLE_CLIENT_ID first (assertGoogleEnabled in
// googleClient.js) and responds 501 GOOGLE_SIGNIN_DISABLED before anything else when unset.

router.post('/google', googleLimiter, validate({ body: schemas.googleSignInSchema }), controller.googleSignIn);
router.post(
  '/google/complete',
  googleLimiter,
  validate({ body: schemas.googleCompleteSchema }),
  controller.googleComplete,
);

router.post(
  '/set-password',
  requireAuth,
  reauthLimiter,
  requireFreshReauth,
  validate({ body: schemas.setPasswordSchema }),
  controller.setPassword,
);

// ---------- Email module: password reset + invite acceptance ----------
// All three are public (no requireAuth) — the caller doesn't have a session yet by definition.

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate({ body: schemas.forgotPasswordSchema }),
  controller.forgotPassword,
);
router.post(
  '/reset-password',
  forgotPasswordLimiter,
  validate({ body: schemas.resetPasswordSchema }),
  controller.resetPassword,
);
router.get(
  '/accept-invite/:token',
  validate({ params: schemas.acceptInviteTokenParamSchema }),
  controller.getInviteContext,
);
router.post(
  '/accept-invite',
  forgotPasswordLimiter,
  validate({ body: schemas.acceptInviteSchema }),
  controller.acceptInvite,
);

export default router;
