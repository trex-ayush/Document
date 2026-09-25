import express from 'express';
import { z } from 'zod';

import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { Family } from '../../models/Family.js';
import { Membership } from '../../models/Membership.js';
import { User } from '../../models/User.js';
import { pageQuery, idParams, escapeRegex, FAMILY_FIELDS, buildFamilyRows, recentActivity } from './lib.js';

const router = express.Router();

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  ...pageQuery,
});

router.get('/', validate({ query: listQuery }), async (req, res, next) => {
  try {
    const { q, page, limit } = req.query;
    const filter = q ? { name: new RegExp(escapeRegex(q), 'i') } : {};
    const [total, families] = await Promise.all([
      Family.countDocuments(filter),
      Family.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(FAMILY_FIELDS)
        .lean(),
    ]);
    res.json({ items: await buildFamilyRows(families), total, page, limit });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const family = await Family.findById(req.params.id).select(FAMILY_FIELDS).lean();
    if (!family) throw new ApiError(404, 'NOT_FOUND', 'Family not found');

    const memberships = await Membership.find({ familyId: family._id })
      .sort({ createdAt: 1 })
      .select('userId name role access status invitedEmail createdAt')
      .lean();
    const userIds = memberships.map((m) => m.userId).filter(Boolean);
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select('email').lean() : [];
    const emailById = new Map(users.map((u) => [String(u._id), u.email]));

    const [[row], activity] = await Promise.all([
      buildFamilyRows([family]),
      recentActivity({ familyId: family._id }, 20),
    ]);

    res.json({
      family: row,
      members: memberships.map((m) => ({
        id: String(m._id),
        userId: m.userId ? String(m.userId) : null,
        name: m.name,
        email: (m.userId && emailById.get(String(m.userId))) || m.invitedEmail || null,
        role: m.role,
        access: m.access,
        status: m.status,
        joinedAt: m.createdAt ?? null,
      })),
      recentActivity: activity,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
