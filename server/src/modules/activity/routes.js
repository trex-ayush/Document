import express from 'express';
import { z } from 'zod';

import { requireAuth, requireFamily, requireWrite, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { Activity } from '../../models/Activity.js';
import { serializeActivity } from './serialize.js';

const router = express.Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const querySchema = z.object({
  memberId: objectId.optional(),
  action: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

/** Compound cursor over (createdAt desc, _id desc), base64url-encoded per docs/API.md's convention. */
function encodeCursor(doc) {
  return Buffer.from(JSON.stringify({ t: doc.createdAt.toISOString(), id: String(doc._id) }), 'utf8').toString(
    'base64url',
  );
}

function decodeCursor(cursor) {
  try {
    const obj = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!obj.t || !obj.id) return null;
    const createdAt = new Date(obj.t);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: obj.id };
  } catch {
    return null;
  }
}

// "Admin or write access only" per docs/API.md == exactly what requireWrite already checks.
router.use(requireAuth, requireFamily, requireWrite);

router.get('/', validate({ query: querySchema }), async (req, res, next) => {
  try {
    const { memberId, action, from, to, cursor, limit } = req.query;
    const filter = scopeToFamily(req.auth.familyId, {});

    if (memberId) filter.actorMembershipId = memberId;
    if (action) filter.action = action;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    if (cursor) {
      const c = decodeCursor(cursor);
      if (!c) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
      filter.$or = [{ createdAt: { $lt: c.createdAt } }, { createdAt: c.createdAt, _id: { $lt: c.id } }];
    }

    const rows = await Activity.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    res.json({
      items: page.map(serializeActivity),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
