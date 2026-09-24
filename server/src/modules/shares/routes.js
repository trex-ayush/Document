import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UAParser } from 'ua-parser-js';

import { requireAuth, requireFamily, requireWrite, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';
import { Share } from '../../models/Share.js';
import { Activity } from '../../models/Activity.js';
import { logActivity } from '../../services/activityLogger.js';
import { generateOpaqueToken, sha256Hex } from '../../utils/crypto.js';
import {
  EXPIRES_IN_MS,
  computeExpiresAt,
  assertSensitiveInvariants,
  loadTarget,
  targetLabelFrom,
  resolveTargetLabels,
  serializeShare,
} from './lib.js';

const router = express.Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const expiresInEnum = z.enum(['1h', '2h', '24h', '7d', '30d', 'never']);

const createShareSchema = z.object({
  targetType: z.enum(['document', 'folder', 'item']),
  targetId: objectId,
  fileIds: z.array(objectId).optional(),
  expiresIn: expiresInEnum,
  allowDownload: z.boolean().optional().default(true),
  password: z.string().min(1).max(200).optional(),
  label: z.string().max(200).optional().default(''),
  includeSensitive: z.boolean().optional().default(false),
});

const listQuerySchema = z.object({
  targetId: objectId.optional(),
  status: z.enum(['active', 'expired', 'revoked']).optional(),
});

const patchShareSchema = z
  .object({
    revoke: z.boolean().optional(),
    extendTo: z.string().min(1).optional(),
    label: z.string().max(200).optional(),
  })
  .refine((b) => b.revoke !== undefined || b.extendTo !== undefined || b.label !== undefined, {
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
      filter.$or = [{ expiresAt: null }, { expiresAt: { $gt: now } }];
    } else if (status === 'expired') {
      filter.revokedAt = null;
      filter.expiresAt = { $ne: null, $lte: now };
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
    const { targetType, targetId, fileIds, expiresIn, allowDownload, password, label, includeSensitive } = req.body;

    // Hard invariants first, before any DB write (and before the target lookup, so an invalid
    // combo never even triggers a read against another module's data).
    assertSensitiveInvariants({ targetType, includeSensitive, password, expiresIn });

    const target = await loadTarget(req.auth.familyId, targetType, targetId);
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'Share target not found');

    let validFileIds;
    if (targetType === 'document' && Array.isArray(fileIds) && fileIds.length) {
      const existing = new Set((target.files || []).map((f) => String(f._id)));
      const filtered = fileIds.filter((id) => existing.has(id));
      validFileIds = filtered.length ? filtered : undefined;
    }

    const token = generateOpaqueToken(32);
    const tokenHash = sha256Hex(token);
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const expiresAt = computeExpiresAt(expiresIn);

    const share = await Share.create({
      familyId: req.auth.familyId,
      tokenHash,
      targetType,
      targetId,
      fileIds: validFileIds,
      label: label || '',
      expiresAt,
      allowDownload,
      includeSensitive,
      passwordHash,
      createdBy: req.auth.membershipId,
    });

    await logActivity(req, {
      action: 'share.create',
      targetType,
      targetId,
      shareId: share._id,
      documentId: targetType === 'document' ? targetId : null,
      folderId: targetType === 'folder' ? targetId : null,
      meta: { label: label || '', includeSensitive },
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

    const { revoke, extendTo, label } = req.body;

    if (revoke) share.revokedAt = new Date();

    if (extendTo) {
      if (EXPIRES_IN_MS[extendTo] || extendTo === 'never') {
        share.expiresAt = computeExpiresAt(extendTo);
      } else {
        const parsed = new Date(extendTo);
        if (Number.isNaN(parsed.getTime())) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'extendTo must be an ISO date or an expiresIn code');
        }
        share.expiresAt = parsed;
      }
    }

    if (label !== undefined) share.label = label;

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
        action: { $in: ['share.open', 'share.download', 'share.password_failed'] },
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
