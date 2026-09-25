import express from 'express';
import archiver from 'archiver';
import { verifyFileToken } from '../../utils/tokens.js';
import { decryptFileBuffer } from '../../utils/crypto.js';
import { getStorage } from '../../storage/index.js';
import { Document, activeFiles } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';
import { scopeToFamily } from '../../middleware/auth.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { getDescendantFolderIds } from '../folders/folderTree.js';
import { verifyZipToken } from './zipTokens.js';
import { env } from '../../config/env.js';

const router = express.Router();

// The client (a different origin on Render) shows PDFs in an <iframe> pointing here, which
// helmet's default `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` would block.
function allowClientToFrame(res) {
  let clientOrigin = '';
  try {
    clientOrigin = new URL(env.CLIENT_URL).origin;
  } catch {
    return;
  }
  const csp = res.getHeader('Content-Security-Policy');
  if (typeof csp === 'string') {
    res.setHeader(
      'Content-Security-Policy',
      csp.replace(/frame-ancestors[^;]*/, `frame-ancestors 'self' ${clientOrigin}`),
    );
  }
  res.removeHeader('X-Frame-Options');
}

// Only these mime types can ever be legitimately stored (documents module enforces this at
// upload time) — an extra whitelist here means even a corrupted/tampered record can never cause
// this route to emit a browser-executable Content-Type (never text/html or image/svg+xml).
const SAFE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

function sanitizeFilename(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 200) || 'file';
}

function uniqueName(used, name) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 2;
  let candidate = `${base} (${n})${ext}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${base} (${n})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * GET /files/zip/:token — streams a ZIP built from a short-lived "zip job" token minted by
 * POST /folders/:id/zip-link or POST /documents/:id/zip-link. No Authorization header: the token
 * (which embeds an already-tenant-scoped folderId/documentId) is the sole credential, same trust
 * model as the single-file route below.
 */
router.get('/zip/:token', async (req, res, next) => {
  try {
    let payload;
    try {
      payload = verifyZipToken(req.params.token);
    } catch {
      throw new ApiError(401, 'INVALID_OR_EXPIRED_FILE_TOKEN', 'Invalid or expired zip link');
    }

    const { scope, targetId, familyId } = payload;
    let documents;
    let zipBaseName;
    let groupByDocument = false;

    if (scope === 'document') {
      const doc = await Document.findOne(scopeToFamily(familyId, { _id: targetId })).lean();
      if (!doc) throw new ApiError(401, 'INVALID_OR_EXPIRED_FILE_TOKEN', 'Invalid or expired zip link');
      documents = [doc];
      zipBaseName = doc.title;
    } else if (scope === 'folder') {
      const folder = await Folder.findOne(scopeToFamily(familyId, { _id: targetId })).lean();
      if (!folder) throw new ApiError(401, 'INVALID_OR_EXPIRED_FILE_TOKEN', 'Invalid or expired zip link');
      const folderIds = await getDescendantFolderIds(familyId, targetId);
      documents = await Document.find(scopeToFamily(familyId, { folderId: { $in: folderIds } })).lean();
      zipBaseName = folder.name;
      groupByDocument = true;
    } else {
      throw new ApiError(401, 'INVALID_OR_EXPIRED_FILE_TOKEN', 'Invalid or expired zip link');
    }

    const fileIdFilter = payload.fileIds && scope === 'document' ? new Set(payload.fileIds) : null;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(zipBaseName)}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      // Headers/bytes are very likely already flushed by the time a mid-stream archive error
      // fires — the shared errorHandler doesn't guard `res.headersSent`, so calling next(err)
      // here would throw a second, uncaught error. Just log and tear down the connection.
      if (res.headersSent) {
        // eslint-disable-next-line no-console
        console.error('[files/zip] stream error after headers sent:', err);
        res.destroy(err);
        return;
      }
      next(err);
    });
    archive.pipe(res);

    const storage = await getStorage();
    const usedNames = new Set();
    let fileCount = 0;

    // eslint-disable-next-line no-restricted-syntax
    for (const doc of documents) {
      const prefix = groupByDocument ? `${sanitizeFilename(doc.title)}/` : '';
      const localUsed = groupByDocument ? new Set() : usedNames;
      // eslint-disable-next-line no-restricted-syntax
      for (const file of activeFiles(doc)) {
        if (fileIdFilter && !fileIdFilter.has(file._id.toString())) continue;
        // eslint-disable-next-line no-await-in-loop
        const cipherBuffer = await storage.getBuffer(file.storageKey);
        const plainBuffer = decryptFileBuffer(cipherBuffer, file.encryption);
        const entryName = uniqueName(localUsed, sanitizeFilename(file.originalName || `${file._id}`));
        archive.append(plainBuffer, { name: `${prefix}${entryName}` });
        fileCount += 1;
      }
    }

    await archive.finalize();

    logActivity(
      { auth: null, ip: req.ip, headers: req.headers },
      {
        action: scope === 'folder' ? 'folder.zip.download' : 'document.zip.download',
        familyId,
        targetType: scope,
        targetId,
        documentId: scope === 'document' ? targetId : null,
        folderId: scope === 'folder' ? targetId : null,
        meta: { fileCount },
      },
    ).catch(() => {});
  } catch (err) {
    if (res.headersSent) {
      // eslint-disable-next-line no-console
      console.error('[files/zip] error after headers sent:', err);
      res.destroy(err);
      return;
    }
    next(err);
  }
});

/**
 * GET /files/:signedToken — no Authorization header needed, the token itself is the credential
 * (see docs/API.md "File tokens"). Verifies + re-resolves the file through a tenant-scoped
 * Document lookup on every request (never trusts stale familyId beyond what the token says),
 * decrypts, and streams. `?download=1` forces an attachment Content-Disposition and is the only
 * case that gets logged (avoids log spam from <img> re-renders/re-mounts).
 */
router.get('/:signedToken', async (req, res, next) => {
  try {
    let payload;
    try {
      payload = verifyFileToken(req.params.signedToken);
    } catch {
      throw new ApiError(401, 'INVALID_OR_EXPIRED_FILE_TOKEN', 'Invalid or expired file token');
    }

    const { fileId, documentId, familyId, kind } = payload;

    const doc = await Document.findOne(scopeToFamily(familyId, { _id: documentId })).lean();
    if (!doc) throw new ApiError(401, 'INVALID_OR_EXPIRED_FILE_TOKEN', 'Invalid or expired file token');

    // A file in the Bin is treated exactly like a missing one — its old signed URLs stop working.
    const file = activeFiles(doc).find((f) => f._id.toString() === fileId);
    if (!file) throw new ApiError(401, 'INVALID_OR_EXPIRED_FILE_TOKEN', 'Invalid or expired file token');

    const useThumb = kind === 'thumb';
    if (useThumb && !file.thumbKey) {
      throw new ApiError(401, 'INVALID_OR_EXPIRED_FILE_TOKEN', 'Invalid or expired file token');
    }

    const storageKey = useThumb ? file.thumbKey : file.storageKey;
    const encryption = useThumb ? file.thumbEncryption : file.encryption;
    const mimeType = useThumb ? 'image/webp' : file.mimeType;

    const storage = await getStorage();
    const cipherBuffer = await storage.getBuffer(storageKey);
    const plainBuffer = decryptFileBuffer(cipherBuffer, encryption);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', SAFE_MIME.has(mimeType) ? mimeType : 'application/octet-stream');
    allowClientToFrame(res);
    res.setHeader('Accept-Ranges', 'bytes');

    const isDownload = req.query.download === '1';
    const filename = useThumb ? sanitizeFilename(`thumb-${file.originalName || fileId}.webp`) : sanitizeFilename(file.originalName);
    res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${filename}"`);

    const total = plainBuffer.length;
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (match) {
        let start = match[1] ? parseInt(match[1], 10) : 0;
        let end = match[2] ? parseInt(match[2], 10) : total - 1;
        if (Number.isNaN(start) || start < 0) start = 0;
        if (Number.isNaN(end) || end > total - 1) end = total - 1;
        if (start > end || total === 0) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(end - start + 1));
        res.end(plainBuffer.subarray(start, end + 1));
        if (isDownload) logDownload(req, { fileId, documentId, familyId, file });
        return;
      }
    }

    res.setHeader('Content-Length', String(total));
    res.status(200).end(plainBuffer);

    if (isDownload) logDownload(req, { fileId, documentId, familyId, file });
  } catch (err) {
    next(err);
  }
});

function logDownload(req, { fileId, documentId, familyId, file }) {
  logActivity(
    { auth: null, ip: req.ip, headers: req.headers },
    {
      action: 'file.download',
      familyId,
      targetType: 'file',
      targetId: fileId,
      documentId,
      meta: { originalName: file.originalName },
    },
  ).catch(() => {});
}

export default router;
