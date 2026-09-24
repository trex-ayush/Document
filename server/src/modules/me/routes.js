import express from 'express';
import { z } from 'zod';

import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { Membership } from '../../models/Membership.js';

/**
 * `/api/me/*` — the caller's own account-scoped settings that aren't part of the Membership/User
 * profile shape the identity modules already serialize. Currently just notification prefs.
 * Mount point (REQUESTED SHARED CHANGE, app.js is lead-owned): `app.use('/api/me', meRoutes);`
 *
 * Admin-only: only admins receive instant alert emails, so a non-admin's prefs are meaningless —
 * see server/src/services/alerts.js for the full list of instant event keys. (There is no daily
 * digest — an earlier draft had one; it was dropped mid-build since the Dashboard/Activity Log
 * already cover that ground on demand, see alerts.js's top comment.)
 */
const router = express.Router();

const patchPrefsSchema = z
  .object({
    instant: z.record(z.string(), z.boolean()).optional(),
  })
  .strict()
  .refine((v) => v.instant !== undefined, { message: 'At least one field is required' });

router.use(requireAuth, requireAdmin);

function serializePrefs(membership) {
  return {
    instant: membership?.notificationPrefs?.instant || {},
  };
}

router.get('/notification-prefs', async (req, res, next) => {
  try {
    const membership = await Membership.findById(req.auth.membershipId).select('notificationPrefs').lean();
    if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Membership not found');
    res.json(serializePrefs(membership));
  } catch (err) {
    next(err);
  }
});

router.patch('/notification-prefs', validate({ body: patchPrefsSchema }), async (req, res, next) => {
  try {
    const membership = await Membership.findById(req.auth.membershipId);
    if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Membership not found');

    membership.notificationPrefs.instant = { ...(membership.notificationPrefs.instant || {}), ...req.body.instant };
    membership.markModified('notificationPrefs.instant');
    await membership.save();

    res.json(serializePrefs(membership));
  } catch (err) {
    next(err);
  }
});

export default router;
