import express from 'express';
import { z } from 'zod';
import { UAParser } from 'ua-parser-js';

import { requireAuth, requireFamily, requireWrite, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';
import { Share } from '../../models/Share.js';
import { Family, SHARE_DURATIONS } from '../../models/Family.js';
import { Activity } from '../../models/Activity.js';
import { logActivity } from '../../services/activityLogger.js';
import { generateOpaqueToken, sha256Hex } from '../../utils/crypto.js';
import {
  computeExpiresAt,
  loadTarget,
  targetLabelFrom,
  resolveTargetLabels,
  serializeShare,
} from './lib.js';

const router = express.Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const durationEnum = z.enum(SHARE_DURATIONS);

const createShareSchema = z.object({
  targetType: z.enum(['document', 'folder']),
  targetId: objectId,
  // Document shares only: expose just these files (e.g. "share this one photo").
  fileIds: z.array(objectId).max(200).optional(),
  // Omitted -> the family's default (Settings > Family).
  duration: durationEnum.optional(),
});

const listQuerySchema = z.object({
  targetId: objectId.optional(),
  status: z.enum(['active', 'expired', 'revoked']).optional(),
});

const patchShareSchema = z
  .object({
    revoke: z.literal(true).optional(),
    // Restart the clock: the link now expires this long from now.
    extendTo: durationEnum.optional(),
  })
  .refine((b) => b.revoke !== undefined || b.extendTo !== undefined, {
    message: 'Nothing to update',
  });

// Every /shares route manages sharing for the family, not just views it — "Write" per docs/API.md.
router.use(requireAuth, requireFamily, requireWrite);

router.get('/', validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const { targetId, status } = req.query;
    const filter = scopeToFamily(req.auth.familyId, {});
    if (targetId) filter.targetId = targetId;

    const now = new Date();
    if (status === 'active') {
      filter.revokedAt = null;
      filter.expiresAt = { $gt: now };
    } else if (status === 'expired') {
      filter.revokedAt = null;
      filter.expiresAt = { $lte: now };
    } else if (status === 'revoked') {
      filter.revokedAt = { $ne: null };
    }

    const shares = await Share.find(filter).sort({ createdAt: -1 }).lean();
    const labelFor = await resolveTargetLabels(req.auth.familyId, shares);
    res.json({ items: shares.map((s) => serializeShare(s, { targetLabel: labelFor(s) })) });
  } catch (err) {
    next(err);
  }
});

router.post('/', validate({ body: createShareSchema }), async (req, res, next) => {
  try {
    const { targetType, targetId, fileIds } = req.body;

    const target = await loadTarget(req.auth.familyId, targetType, targetId);
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'Share target not found');

    let validFileIds;
    if (targetType === 'document' && Array.isArray(fileIds) && fileIds.length) {
      const existing = new Set((target.files || []).map((f) => String(f._id)));
      validFileIds = [...new Set(fileIds)].filter((id) => existing.has(id));
      if (!validFileIds.length) throw new ApiError(404, 'NOT_FOUND', 'File not found in this document');
    }

    let { duration } = req.body;
    if (!duration) {
      const family = await Family.findById(req.auth.familyId).select('settings.defaultShareDuration').lean();
      duration = family?.settings?.defaultShareDuration || '12h';
    }

    const token = generateOpaqueToken(32);
    const share = await Share.create({
      familyId: req.auth.familyId,
      tokenHash: sha256Hex(token),
      targetType,
      targetId,
      fileIds: validFileIds,
      duration,
      expiresAt: computeExpiresAt(duration),
      createdBy: req.auth.membershipId,
    });

    await logActivity(req, {
      action: 'share.create',
      targetType,
      targetId,
      shareId: share._id,
      documentId: targetType === 'document' ? targetId : null,
      folderId: targetType === 'folder' ? targetId : null,
      meta: { duration, fileCount: validFileIds?.length ?? null },
    });

    const url = `${env.CLIENT_URL}/s/${token}`;
    res.status(201).json(serializeShare(share, { url, targetLabel: targetLabelFrom(targetType, target) }));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate({ body: patchShareSchema }), async (req, res, next) => {
  try {
    const share = await Share.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id }));
    if (!share) throw new ApiError(404, 'NOT_FOUND', 'Share not found');

    const { revoke, extendTo } = req.body;

    if (revoke && !share.revokedAt) share.revokedAt = new Date();

    if (extendTo) {
      share.duration = extendTo;
      share.expiresAt = computeExpiresAt(extendTo);
    }

    await share.save();

    await logActivity(req, {
      action: revoke ? 'share.revoke' : 'share.update',
      targetType: share.targetType,
      targetId: share.targetId,
      shareId: share._id,
      meta: { revoke: !!revoke, extendTo: extendTo || null },
    });

    const target = await loadTarget(req.auth.familyId, share.targetType, share.targetId);
    res.json(serializeShare(share, { targetLabel: targetLabelFrom(share.targetType, target) }));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const share = await Share.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id }));
    if (!share) throw new ApiError(404, 'NOT_FOUND', 'Share not found');

    // "Owner/admin only" per docs/API.md — owner here means the membership that created the share.
    if (req.auth.role !== 'admin' && String(share.createdBy) !== req.auth.membershipId) {
      throw new ApiError(403, 'FORBIDDEN', 'Only the share creator or an admin can delete this share');
    }

    await share.deleteOne();

    await logActivity(req, {
      action: 'share.delete',
      targetType: share.targetType,
      targetId: share.targetId,
      shareId: share._id,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/:id/access-log', async (req, res, next) => {
  try {
    const share = await Share.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id })).lean();
    if (!share) throw new ApiError(404, 'NOT_FOUND', 'Share not found');

    const logs = await Activity.find(
      scopeToFamily(req.auth.familyId, {
        shareId: share._id,
        action: { $in: ['share.open', 'share.download'] },
      }),
    )
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({
      items: logs.map((l) => {
        const parsed = new UAParser(l.userAgent || '').getResult();
        return {
          time: l.createdAt,
          ipHash: l.ipHash,
          device: parsed.device?.model || parsed.device?.type || 'desktop',
          browser: parsed.browser?.name || 'unknown',
          action: l.action,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
