import express from 'express';
import { z } from 'zod';

import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { User } from '../../models/User.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { revokeAllRefreshTokensForUser } from '../auth/tokenService.js';
import { isSuperAdminEmail } from '../../services/platformRoles.js';
import { logAdminAction } from './audit.js';
import {
  pageQuery,
  idParams,
  escapeRegex,
  USER_FIELDS,
  buildUserRows,
  activityFilterForUser,
  recentActivity,
} from './lib.js';

const router = express.Router();

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['all', 'active', 'disabled']).optional().default('all'),
  ...pageQuery,
});

router.get('/', validate({ query: listQuery }), async (req, res, next) => {
  try {
    const { q, status, page, limit } = req.query;
    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    if (status === 'active') filter.disabled = { $ne: true };
    if (status === 'disabled') filter.disabled = true;

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(USER_FIELDS)
        .lean(),
    ]);
    res.json({ items: await buildUserRows(users), total, page, limit });
  } catch (err) {
    next(err);
  }
});

async function loadUser(id) {
  const user = await User.findById(id).select(USER_FIELDS).lean();
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  return user;
}

router.get('/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const user = await loadUser(req.params.id);
    const [[row], activeSessions, activity] = await Promise.all([
      buildUserRows([user]),
      RefreshToken.countDocuments({ userId: user._id, revokedAt: null, expiresAt: { $gt: new Date() } }),
      activityFilterForUser(user._id).then((f) => recentActivity(f, 20)),
    ]);
    res.json({ user: row, activeSessions, recentActivity: activity });
  } catch (err) {
    next(err);
  }
});

/** The super admin can never be disabled/logged out from here; `self` blocks acting on yourself. */
function guardTarget(req, user, { self = true } = {}) {
  if (isSuperAdminEmail(user.email)) {
    throw new ApiError(403, 'SUPER_ADMIN_PROTECTED', 'The super admin cannot be changed here');
  }
  if (self && String(user._id) === String(req.auth.userId)) {
    throw new ApiError(403, 'CANNOT_MODIFY_SELF', 'You cannot do this to your own account');
  }
}

// Signs the person out everywhere at once — including the access token they're using right now.
async function revokeSessions(userId) {
  return revokeAllRefreshTokensForUser(userId);
}

const patchBody = z.object({ disabled: z.boolean() }).strict();

router.patch('/:id', validate({ params: idParams, body: patchBody }), async (req, res, next) => {
  try {
    const user = await loadUser(req.params.id);
    guardTarget(req, user);

    const { disabled } = req.body;
    if (Boolean(user.disabled) !== disabled) {
      await User.updateOne({ _id: user._id }, { $set: { disabled } });
      // A disabled account is already refused by requireAuth and /auth/refresh; also end its
      // sessions so nothing lingers.
      if (disabled) await revokeSessions(user._id);
      await logAdminAction(req, {
        action: disabled ? 'admin.user.disable' : 'admin.user.enable',
        targetType: 'user',
        targetId: user._id,
        targetTitle: user.email,
      });
    }

    const [row] = await buildUserRows([await loadUser(user._id)]);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/logout-all', validate({ params: idParams }), async (req, res, next) => {
  try {
    const user = await loadUser(req.params.id);
    // Logging yourself out everywhere is harmless, so only the super admin is protected here.
    guardTarget(req, user, { self: false });

    const revoked = await revokeSessions(user._id);
    await logAdminAction(req, {
      action: 'admin.user.logout_all',
      targetType: 'user',
      targetId: user._id,
      targetTitle: user.email,
    });
    res.json({ revoked });
  } catch (err) {
    next(err);
  }
});

export default router;
