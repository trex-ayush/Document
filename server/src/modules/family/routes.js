import express from 'express';

import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { Family } from '../../models/Family.js';
import { serializeFamily } from '../auth/serializers.js';
import { patchFamilySchema } from './schemas.js';

const router = express.Router();

router.use(requireAuth);

// NOTE: Family documents ARE the tenant root (no `familyId` field of their own — `_id` IS the
// family id), so we deliberately do NOT run this through scopeToFamily() (which merges in a
// `{ familyId }` filter that doesn't exist on this schema and would just never match). The only
// scoping needed here is "look up exactly req.auth.familyId", which findById already gives us.

router.get('/', async (req, res, next) => {
  try {
    const family = await Family.findById(req.auth.familyId);
    if (!family) throw new ApiError(404, 'NOT_FOUND', 'Family not found');
    res.json(serializeFamily(family));
  } catch (err) {
    next(err);
  }
});

router.patch('/', requireAdmin, validate({ body: patchFamilySchema }), async (req, res, next) => {
  try {
    const family = await Family.findById(req.auth.familyId);
    if (!family) throw new ApiError(404, 'NOT_FOUND', 'Family not found');

    if (req.body.name !== undefined) family.name = req.body.name;
    if (req.body.settings) {
      if (req.body.settings.activityRetentionDays !== undefined) {
        family.settings.activityRetentionDays = req.body.settings.activityRetentionDays;
      }
      if (req.body.settings.requireReauthForSecrets !== undefined) {
        family.settings.requireReauthForSecrets = req.body.settings.requireReauthForSecrets;
      }
    }
    await family.save();

    await logActivity(req, {
      action: 'family.update',
      targetType: 'family',
      targetId: family._id,
      meta: { changedKeys: Object.keys(req.body) },
    });

    res.json(serializeFamily(family));
  } catch (err) {
    next(err);
  }
});

export default router;
