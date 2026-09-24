import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as schemas from './schemas.js';
import * as controller from './controller.js';
import { loginLimiter, signupLimiter, reauthLimiter } from './rateLimiters.js';

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

router.post(
  '/reauth',
  requireAuth,
  reauthLimiter,
  validate({ body: schemas.reauthSchema }),
  controller.reauth,
);

export default router;
