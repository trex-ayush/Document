import express from 'express';
import archiver from 'archiver';

import { ApiError } from '../../middleware/errorHandler.js';
import { scopeToFamily } from '../../middleware/auth.js';
import { Share } from '../../models/Share.js';
import { Family } from '../../models/Family.js';
import { Document } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';
import { logActivity } from '../../services/activityLogger.js';
import { sha256Hex, decryptFileBuffer } from '../../utils/crypto.js';
import { getStorage } from '../../storage/index.js';
import { serializeDocumentFiles, buildFolderTree, collectFilesForDocumentShare, collectFilesForFolderShare } from './serializers.js';

const router = express.Router();

/**
 * Loads a share by its raw token: exists, not revoked, not expired. Links have no password —
 * anyone with the URL can view and download until it expires or is revoked.
 */
async function resolveShare(token) {
  const share = await Share.findOne({ tokenHash: sha256Hex(token) });
  if (!share) throw new ApiError(404, 'NOT_FOUND', 'Share not found');

  if (share.revokedAt) throw new ApiError(410, 'REVOKED', 'This share has been revoked');
  if (!share.expiresAt || share.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(410, 'EXPIRED', 'This share has expired');
  }
  return share;
}

/**
 * Public share payload — titles and files ONLY. Never document notes, passwords, note items or
 * internal ids beyond file ids:
 *   { familyName, targetType, expiresAt, document?: { title, files }, folderTree?: { name, documents, subfolders } }
 */
router.get('/shares/:token', async (req, res, next) => {
  try {
    const share = await resolveShare(req.params.token);

    const payload = {
      familyName: '',
      targetType: share.targetType,
      expiresAt: share.expiresAt,
    };

    const family = await Family.findById(share.familyId).select('name').lean();
    payload.familyName = family?.name || '';

    if (share.targetType === 'document') {
      const document = await Document.findOne(scopeToFamily(share.familyId, { _id: share.targetId }))
        .select('familyId title files')
        .lean();
      if (!document) throw new ApiError(404, 'NOT_FOUND', 'Shared document not found');
      payload.document = {
        title: document.title,
        files: serializeDocumentFiles(document, { fileIds: share.fileIds, familyId: share.familyId }),
      };
    } else if (share.targetType === 'folder') {
      const tree = await buildFolderTree(share.familyId, share.targetId);
      if (!tree) throw new ApiError(404, 'NOT_FOUND', 'Shared folder not found');
      payload.folderTree = tree;
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
    const share = await resolveShare(req.params.token);

    let entries = [];
    if (share.targetType === 'document') {
      entries = await collectFilesForDocumentShare(share.familyId, share);
    } else if (share.targetType === 'folder') {
      const folder = await Folder.findOne(scopeToFamily(share.familyId, { _id: share.targetId })).lean();
      if (!folder) throw new ApiError(404, 'NOT_FOUND', 'Shared folder not found');
      entries = await collectFilesForFolderShare(share.familyId, share.targetId);
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
