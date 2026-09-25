import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as schemas from './schemas.js';
import * as controller from './controller.js';
import { loginLimiter, signupLimiter, setPasswordLimiter, googleLimiter, forgotPasswordLimiter } from './rateLimiters.js';

const router = express.Router();

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

// Google-only accounts add their first password here (no current password exists to re-enter).
// An account that already has a password must use /change-password instead — see service.js.
router.post(
  '/set-password',
  requireAuth,
  setPasswordLimiter,
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
