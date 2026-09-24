import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';
import { PlatformSettings, getPlatformSettings } from '../../models/PlatformSettings.js';

// Deployment-wide settings — NOT per-family. See docs/DECISIONS.md "Platform settings" and
// models/PlatformSettings.js. GET is public (the login/signup page needs it pre-auth to decide
// which sign-in buttons to show); PATCH is gated to whoever is logged in as PLATFORM_OWNER_EMAIL —
// there's no platform-super-admin role in this app, so identity is env-configured.
const router = express.Router();

/** GET /platform-settings — public, no auth needed. */
router.get('/', async (req, res, next) => {
  try {
    const settings = await getPlatformSettings();
    res.json({ allowedLoginMethods: settings.allowedLoginMethods });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  allowedLoginMethods: z.enum(['google', 'password', 'both']),
});

/** PATCH /platform-settings — only the configured platform owner (by email) may write. */
router.patch('/', requireAuth, validate({ body: patchSchema }), async (req, res, next) => {
  try {
    if (!env.PLATFORM_OWNER_EMAIL || req.auth.user.email !== env.PLATFORM_OWNER_EMAIL) {
      throw new ApiError(403, 'FORBIDDEN', 'Not the platform owner');
    }
    const updated = await PlatformSettings.findByIdAndUpdate(
      'platform',
      { $set: { allowedLoginMethods: req.body.allowedLoginMethods } },
      { new: true, upsert: true },
    ).lean();
    res.json({ allowedLoginMethods: updated.allowedLoginMethods });
  } catch (err) {
    next(err);
  }
});

export default router;
