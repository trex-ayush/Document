import express from 'express';
import bcrypt from 'bcryptjs';
import archiver from 'archiver';

import { ApiError } from '../../middleware/errorHandler.js';
import { scopeToFamily } from '../../middleware/auth.js';
import { Share } from '../../models/Share.js';
import { Family } from '../../models/Family.js';
import { Document } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';
import { logActivity } from '../../services/activityLogger.js';
import { sha256Hex, hashIp, decryptFileBuffer } from '../../utils/crypto.js';
import { getStorage } from '../../storage/index.js';
import { getItemForShare } from '../items/integration.js';
import { isLockedOut, recordFailure, resetLockout } from './lockout.js';
import { serializeDocumentFiles, buildFolderTree, collectFilesForDocumentShare, collectFilesForFolderShare } from './serializers.js';

const router = express.Router();

function getClientIp(req) {
  return req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
}

/**
 * Loads a share by its raw token and enforces the public-access invariants in order: exists,
 * not revoked, not expired, then (if it has a password) the X-Share-Password header — with the
 * 5-attempts-per-15-minutes lockout from ./lockout.js. Throws the exact ApiError codes/statuses
 * docs/API.md lists for GET /public/shares/:token (reused as-is by the zip-link route, since it
 * has "same header/auth model").
 */
async function resolveShare(req, token) {
  const tokenHash = sha256Hex(token);
  const share = await Share.findOne({ tokenHash });
  if (!share) throw new ApiError(404, 'NOT_FOUND', 'Share not found');

  if (share.revokedAt) throw new ApiError(410, 'REVOKED', 'This share has been revoked');
  if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(410, 'EXPIRED', 'This share has expired');
  }

  if (share.passwordHash) {
    const provided = req.headers['x-share-password'];
    if (!provided) throw new ApiError(401, 'PASSWORD_REQUIRED', 'A password is required to view this share');

    const ipHash = hashIp(getClientIp(req)) || 'unknown';
    const lockKey = `${share.id}:${ipHash}`;
    if (isLockedOut(lockKey)) {
      throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts — try again later');
    }

    const valid = await bcrypt.compare(String(provided), share.passwordHash);
    if (!valid) {
      recordFailure(lockKey);
      await logActivity(req, {
        action: 'share.password_failed',
        targetType: share.targetType,
        targetId: share.targetId,
        shareId: share._id,
        familyId: share.familyId,
      });
      throw new ApiError(401, 'PASSWORD_INVALID', 'Incorrect password');
    }
    resetLockout(lockKey);
  }

  return share;
}

router.get('/shares/:token', async (req, res, next) => {
  try {
    const share = await resolveShare(req, req.params.token);

    const payload = {
      familyName: '',
      label: share.label || '',
      targetType: share.targetType,
      allowDownload: share.allowDownload,
      expiresAt: share.expiresAt,
    };

    const family = await Family.findById(share.familyId).select('name').lean();
    payload.familyName = family?.name || '';

    if (share.targetType === 'document') {
      const document = await Document.findOne(scopeToFamily(share.familyId, { _id: share.targetId })).lean();
      if (!document) throw new ApiError(404, 'NOT_FOUND', 'Shared document not found');
      payload.document = {
        title: document.title,
        files: serializeDocumentFiles(document, { fileIds: share.fileIds, familyId: share.familyId }),
      };
    } else if (share.targetType === 'folder') {
      const tree = await buildFolderTree(share.familyId, share.targetId);
      if (!tree) throw new ApiError(404, 'NOT_FOUND', 'Shared folder not found');
      payload.folderTree = tree;
    } else if (share.targetType === 'item') {
      // Shape owned by the Items module (docs/ITEMS.md) — passed through as-is. `includeSensitive`
      // is only ever true here because the shares module already enforced password+<=24h expiry
      // at creation time (assertSensitiveInvariants in ../shares/lib.js).
      const item = await getItemForShare(share.familyId, share.targetId, {
        includeSensitive: share.includeSensitive,
      });
      if (!item) throw new ApiError(404, 'NOT_FOUND', 'Shared item not found');
      payload.item = item;
    }

    await Share.updateOne({ _id: share._id }, { $inc: { openCount: 1 }, $set: { lastOpenedAt: new Date() } });
    await logActivity(req, {
      action: 'share.open',
      targetType: share.targetType,
      targetId: share.targetId,
      shareId: share._id,
      familyId: share.familyId,
    });

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.post('/shares/:token/zip-link', async (req, res, next) => {
  try {
    const share = await resolveShare(req, req.params.token);

    if (!share.allowDownload) {
      throw new ApiError(403, 'DOWNLOAD_NOT_ALLOWED', 'Downloads are disabled for this share');
    }

    let entries = [];
    if (share.targetType === 'document') {
      entries = await collectFilesForDocumentShare(share.familyId, share);
    } else if (share.targetType === 'folder') {
      const folder = await Folder.findOne(scopeToFamily(share.familyId, { _id: share.targetId })).lean();
      if (!folder) throw new ApiError(404, 'NOT_FOUND', 'Shared folder not found');
      entries = await collectFilesForFolderShare(share.familyId, share.targetId);
    } else {
      // 'item' shares aren't file-bearing today — nothing to zip.
      entries = [];
    }

    if (!entries.length) throw new ApiError(404, 'NOT_FOUND', 'No downloadable files for this share');

    const storage = await getStorage();

    // Record the download BEFORE streaming starts, not after: the response stream ends (and the
    // client's request resolves) as soon as the archive finishes piping, which can race ahead of
    // any awaits placed after `archive.finalize()` — those would sometimes still be in flight
    // when the caller already has their bytes. Counting "attempted" downloads up front (rather
    // than racing a "confirmed fully received" count) is the safe side of that tradeoff.
    await Share.updateOne({ _id: share._id }, { $inc: { downloadCount: 1 } });
    await logActivity(req, {
      action: 'share.download',
      targetType: share.targetType,
      targetId: share.targetId,
      shareId: share._id,
      familyId: share.familyId,
    });

    res.status(200);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="share.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      if (!res.headersSent) return next(err);
      res.destroy(err);
    });
    archive.pipe(res);

    for (const { file, path } of entries) {
      // eslint-disable-next-line no-await-in-loop
      const ciphertext = await storage.getBuffer(file.storageKey);
      const plaintext = decryptFileBuffer(ciphertext, file.encryption);
      archive.append(plaintext, { name: path || file.originalName });
    }

    await archive.finalize();
  } catch (err) {
    next(err);
  }
});

export default router;
