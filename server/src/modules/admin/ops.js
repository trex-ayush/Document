import express from 'express';
import { z } from 'zod';

import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { Activity } from '../../models/Activity.js';
import { Share } from '../../models/Share.js';
import { logAdminAction } from './audit.js';
import {
  objectIdSchema,
  idParams,
  pageQuery,
  limitSchema,
  oid,
  buildActivityRows,
  activityFilterForUser,
  SHARE_FIELDS,
  buildShareRows,
  shareStatusFilter,
} from './lib.js';

// GET /activity, GET /shares, POST /shares/:id/revoke — see docs/ADMIN_API.md.
const router = express.Router();

/* ------------------------------------------------------------------ activity */

// Same compound (createdAt desc, _id desc) cursor as the family feed (modules/activity/routes.js).
function encodeCursor(doc) {
  return Buffer.from(JSON.stringify({ t: doc.createdAt.toISOString(), id: String(doc._id) }), 'utf8').toString(
    'base64url',
  );
}

function decodeCursor(cursor) {
  try {
    const obj = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const createdAt = new Date(obj.t);
    if (!obj.id || !/^[0-9a-fA-F]{24}$/.test(obj.id) || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: oid(obj.id) };
  } catch {
    return null;
  }
}

const dateString = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date')
  .optional();

const activityQuery = z.object({
  familyId: objectIdSchema.optional(),
  userId: objectIdSchema.optional(),
  action: z.string().trim().min(1).max(100).optional(),
  from: dateString,
  to: dateString,
  cursor: z.string().max(500).optional(),
  limit: limitSchema(50),
});

router.get('/activity', validate({ query: activityQuery }), async (req, res, next) => {
  try {
    const { familyId, userId, action, from, to, cursor, limit } = req.query;
    const and = [];
    if (familyId) and.push({ familyId: oid(familyId) });
    if (userId) and.push(await activityFilterForUser(userId));
    if (action) and.push({ action });
    if (from || to) {
      const range = {};
      if (from) range.$gte = new Date(from);
      if (to) range.$lte = new Date(to);
      and.push({ createdAt: range });
    }
    if (cursor) {
      const c = decodeCursor(cursor);
      if (!c) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
      and.push({ $or: [{ createdAt: { $lt: c.createdAt } }, { createdAt: c.createdAt, _id: { $lt: c.id } }] });
    }

    const rows = await Activity.find(and.length ? { $and: and } : {})
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .select('familyId actorMembershipId actorName action targetType meta createdAt')
      .lean();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    res.json({
      items: await buildActivityRows(page),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------- shares */

const sharesQuery = z.object({
  status: z.enum(['active', 'expired', 'revoked', 'all']).optional().default('all'),
  familyId: objectIdSchema.optional(),
  ...pageQuery,
});

router.get('/shares', validate({ query: sharesQuery }), async (req, res, next) => {
  try {
    const { status, familyId, page, limit } = req.query;
    const filter = { ...shareStatusFilter(status) };
    if (familyId) filter.familyId = oid(familyId);

    const [total, shares] = await Promise.all([
      Share.countDocuments(filter),
      Share.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(SHARE_FIELDS)
        .lean(),
    ]);
    res.json({ items: await buildShareRows(shares), total, page, limit });
  } catch (err) {
    next(err);
  }
});

router.post('/shares/:id/revoke', validate({ params: idParams }), async (req, res, next) => {
  try {
    const share = await Share.findById(req.params.id).select(SHARE_FIELDS).lean();
    if (!share) throw new ApiError(404, 'NOT_FOUND', 'Share not found');

    if (!share.revokedAt) {
      share.revokedAt = new Date();
      await Share.updateOne({ _id: share._id, revokedAt: null }, { $set: { revokedAt: share.revokedAt } });
      const [row] = await buildShareRows([share]);
      await logAdminAction(req, {
        action: 'admin.share.revoke',
        targetType: share.targetType,
        targetId: share.targetId,
        familyId: share.familyId,
        shareId: share._id,
        targetTitle: row.targetTitle,
      });
      return res.json(row);
    }

    const [row] = await buildShareRows([share]);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

export default router;
