import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { Document } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';
import { Activity } from '../../models/Activity.js';
import { requireAuth, requireFamily, requireWrite, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { getStorage, makeStorageKey } from '../../storage/index.js';
import { encryptFileBuffer } from '../../utils/crypto.js';

import { serializeDocumentSummary, serializeDocumentDetail } from './serializer.js';
import { validateAndProcessFile } from './fileValidation.js';
import { shouldLogView } from './viewThrottle.js';
import { totalStoredBytes, adjustFamilyStorageBytes } from './storageAccounting.js';
import { sealText } from './secretText.js';
import { getEffectiveFamilySettings } from '../../utils/effectiveSettings.js';
import { buildBreadcrumbs } from '../folders/folderTree.js';
import { resolveTargetFolder } from '../folders/sharedFolder.js';
import { signZipToken } from '../files/zipTokens.js';

const router = express.Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
// Omitted, `null` or `'root'` all mean "the Shared folder" — nothing lives loose at the top level.
const folderIdInput = z.union([objectId, z.literal('root')]).nullable();

const createDocumentDataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  folderId: folderIdInput.optional(),
  notes: z.string().max(5000).optional().default(''),
});

const patchDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  folderId: folderIdInput.optional(),
  notes: z.string().max(5000).optional(),
});

const listQuerySchema = z.object({
  folderId: objectId.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const idParamSchema = z.object({ id: objectId });
const fileIdParamSchema = z.object({ id: objectId, fileId: objectId });

const zipLinkBodySchema = z.object({ fileIds: z.array(objectId).optional() });

// The per-file size cap is the platform admin's `maxFileMB` (-> env.MAX_FILE_MB), resolved per
// request — so multer is built per request with that limit instead of once with the env value
// (a fixed env cap would silently override a platform admin who raised the limit). The resolved
// number is stashed on `req.uploadMaxFileMB` so the handler's post-decode check uses the same one.
function makeUpload(maxFileMB) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileMB * 1024 * 1024, files: 20 },
  });
}

function multerErrorToApiError(err, maxFileMB) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new ApiError(413, 'FILE_TOO_LARGE', `File exceeds the ${maxFileMB}MB limit`);
  }
  return new ApiError(400, 'VALIDATION_ERROR', err.message || 'Invalid upload');
}

function uploadMiddleware(fields) {
  return async (req, res, next) => {
    const { maxFileMB } = await getEffectiveFamilySettings(req.auth.familyId); // never throws
    req.uploadMaxFileMB = maxFileMB;
    makeUpload(maxFileMB).fields(fields)(req, res, (err) => {
      if (err) return next(multerErrorToApiError(err, maxFileMB));
      next();
    });
  };
}

const uploadFiles = uploadMiddleware([{ name: 'files', maxCount: 20 }]);

function parseLabels(raw, expectedCount) {
  if (raw === undefined) return new Array(expectedCount).fill('');
  let labels;
  try {
    labels = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'labels must be a JSON array of strings');
  }
  if (!Array.isArray(labels) || labels.length !== expectedCount) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'labels must be a JSON array matching files length');
  }
  return labels.map((l) => String(l ?? ''));
}

function parseJsonBody(raw, schema) {
  let parsed;
  try {
    parsed = JSON.parse(raw ?? '{}');
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid JSON in "data" field');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', result.error.flatten());
  }
  return result.data;
}

async function loadBreadcrumbsForDoc(familyId, doc) {
  const folder = doc.folderId
    ? await Folder.findOne(scopeToFamily(familyId, { _id: doc.folderId })).lean()
    : null;
  return buildBreadcrumbs(familyId, folder);
}

/**
 * Store one already-validated+processed file (and its thumbnail, if any). Returns
 * `{ subdoc, storedBytes }` — `storedBytes` is the actual encrypted byte count written to the
 * storage driver (original + thumbnail), used to keep `Family.storageBytes` accurate.
 */
async function persistFile(storage, familyId, membershipId, processed, label, order) {
  const { ciphertext, encryption } = encryptFileBuffer(processed.buffer);
  const storageKey = makeStorageKey('families', familyId, 'documents', 'files', randomUUID());
  await storage.put(storageKey, ciphertext, { mimeType: processed.mimeType });
  let storedBytes = ciphertext.length;

  let thumbKey = null;
  let thumbEncryption = null;
  if (processed.thumbBuffer) {
    const thumbCipher = encryptFileBuffer(processed.thumbBuffer);
    thumbKey = makeStorageKey('families', familyId, 'documents', 'thumbs', randomUUID());
    await storage.put(thumbKey, thumbCipher.ciphertext, { mimeType: 'image/webp' });
    thumbEncryption = thumbCipher.encryption;
    storedBytes += thumbCipher.ciphertext.length;
  }

  const subdoc = {
    label: label || '',
    order,
    storageKey,
    thumbKey,
    originalName: processed.originalName,
    mimeType: processed.mimeType,
    size: processed.buffer.length,
    width: processed.width,
    height: processed.height,
    encryption,
    thumbEncryption,
    uploadedBy: membershipId,
    uploadedAt: new Date(),
  };
  return { subdoc, storedBytes };
}

router.use(requireAuth, requireFamily);

/** GET /documents?folderId=&page=&limit= — newest first; `folderId` = directly in that folder. */
router.get('/', validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const { folderId, page, limit } = req.query;

    const filter = scopeToFamily(familyId, {});
    if (folderId) filter.folderId = folderId;

    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      Document.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Document.countDocuments(filter),
    ]);

    res.json({
      items: docs.map(serializeDocumentSummary),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /documents/:id */
router.get('/:id', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    const breadcrumbs = await loadBreadcrumbsForDoc(familyId, doc);

    if (shouldLogView(membershipId, String(doc._id))) {
      await Document.updateOne({ _id: doc._id }, { $set: { lastViewedAt: new Date() } });
      await logActivity(req, {
        action: 'document.view',
        targetType: 'document',
        targetId: doc._id,
        documentId: doc._id,
        folderId: doc.folderId,
        meta: {},
      });
    }

    res.json(serializeDocumentDetail(doc, { breadcrumbs }));
  } catch (err) {
    next(err);
  }
});

/** POST /documents — multipart: `data` (JSON), `files` (1+), `labels` (JSON array). */
router.post('/', requireWrite, uploadFiles, async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const data = parseJsonBody(req.body.data, createDocumentDataSchema);

    const folder = await resolveTargetFolder(familyId, data.folderId);

    const uploaded = req.files?.files || [];
    if (!uploaded.length) throw new ApiError(400, 'VALIDATION_ERROR', 'At least one file is required');
    const labels = parseLabels(req.body.labels, uploaded.length);

    const maxFileMB = req.uploadMaxFileMB;
    const storage = await getStorage();
    const fileSubdocs = [];
    let totalNewBytes = 0;
    // Sequential on purpose — keeps memory bounded (each file is decoded/encrypted/re-encoded in
    // full) and storage.put() calls ordered; upload batches are small (<=20 files).
    // eslint-disable-next-line no-restricted-syntax
    for (let i = 0; i < uploaded.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const processed = await validateAndProcessFile(uploaded[i].buffer, uploaded[i].originalname, maxFileMB);
      // eslint-disable-next-line no-await-in-loop
      const { subdoc, storedBytes } = await persistFile(storage, familyId, membershipId, processed, labels[i], i);
      fileSubdocs.push(subdoc);
      totalNewBytes += storedBytes;
    }

    const doc = await Document.create({
      familyId,
      folderId: folder._id,
      title: data.title,
      notes: sealText(data.notes),
      files: fileSubdocs,
      createdBy: membershipId,
    });

    await adjustFamilyStorageBytes(familyId, totalNewBytes);

    await logActivity(req, {
      action: 'document.create',
      targetType: 'document',
      targetId: doc._id,
      documentId: doc._id,
      folderId: doc.folderId,
      meta: { title: doc.title, fileCount: fileSubdocs.length },
    });

    const breadcrumbs = await buildBreadcrumbs(familyId, folder);
    res.status(201).json(serializeDocumentDetail(doc.toObject(), { breadcrumbs }));
  } catch (err) {
    next(err);
  }
});

/** PATCH /documents/:id — `{ title?, notes?, folderId? }`; folderId null/'root' = Shared. */
router.patch('/:id', requireWrite, validate({ params: idParamSchema, body: patchDocumentSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id }));
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    const body = req.body;
    if (body.folderId !== undefined) {
      const folder = await resolveTargetFolder(familyId, body.folderId);
      doc.folderId = folder._id;
    }
    if (body.title !== undefined) doc.title = body.title;
    if (body.notes !== undefined) doc.notes = sealText(body.notes);

    doc.updatedBy = membershipId;
    await doc.save();

    await logActivity(req, {
      action: 'document.update',
      targetType: 'document',
      targetId: doc._id,
      documentId: doc._id,
      folderId: doc.folderId,
      meta: { fields: Object.keys(body) },
    });

    const breadcrumbs = await loadBreadcrumbsForDoc(familyId, doc);
    res.json(serializeDocumentDetail(doc.toObject(), { breadcrumbs }));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /documents/:id — SOFT delete (docs/DECISIONS.md "Soft delete / recycle bin"): moves the
 * document into the family's Bin instead of removing it. Files stay in storage untouched (still
 * counted against the family's storage quota — see docs/DECISIONS.md) and the DB row stays put;
 * only the platform admin's permanent-delete action (modules/bin/lib.js#permanentlyPurgeOne) ever
 * calls storage.delete() or Document.deleteOne() for a user-initiated delete.
 */
router.delete('/:id', requireWrite, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    await Document.updateOne({ _id: doc._id }, { $set: { deletedAt: new Date(), deletedBy: membershipId } });

    await logActivity(req, {
      action: 'document.delete',
      targetType: 'document',
      targetId: doc._id,
      folderId: doc.folderId,
      meta: { title: doc.title },
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** POST /documents/:id/files — appends files. */
router.post('/:id/files', requireWrite, validate({ params: idParamSchema }), uploadFiles, async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id }));
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    const uploaded = req.files?.files || [];
    if (!uploaded.length) throw new ApiError(400, 'VALIDATION_ERROR', 'At least one file is required');
    const labels = parseLabels(req.body.labels, uploaded.length);

    const maxFileMB = req.uploadMaxFileMB;
    const storage = await getStorage();
    let nextOrder = doc.files.reduce((max, f) => Math.max(max, f.order), -1) + 1;
    let totalNewBytes = 0;

    // eslint-disable-next-line no-restricted-syntax
    for (let i = 0; i < uploaded.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const processed = await validateAndProcessFile(uploaded[i].buffer, uploaded[i].originalname, maxFileMB);
      // eslint-disable-next-line no-await-in-loop
      const { subdoc, storedBytes } = await persistFile(storage, familyId, membershipId, processed, labels[i], nextOrder);
      doc.files.push(subdoc);
      totalNewBytes += storedBytes;
      nextOrder += 1;
    }

    doc.updatedBy = membershipId;
    await doc.save();
    await adjustFamilyStorageBytes(familyId, totalNewBytes);

    await logActivity(req, {
      action: 'document.file.add',
      targetType: 'document',
      targetId: doc._id,
      documentId: doc._id,
      folderId: doc.folderId,
      meta: { count: uploaded.length },
    });

    const breadcrumbs = await loadBreadcrumbsForDoc(familyId, doc);
    res.json(serializeDocumentDetail(doc.toObject(), { breadcrumbs }));
  } catch (err) {
    next(err);
  }
});

/** DELETE /documents/:id/files/:fileId */
router.delete('/:id/files/:fileId', requireWrite, validate({ params: fileIdParamSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id }));
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    const file = doc.files.id(req.params.fileId);
    if (!file) throw new ApiError(404, 'FILE_NOT_FOUND', 'File not found');
    if (doc.files.length <= 1) {
      throw new ApiError(400, 'LAST_FILE', 'A document needs at least one file — delete the document instead');
    }

    const { storageKey, thumbKey } = file;
    const storage = await getStorage();
    const freedBytes = await totalStoredBytes(storage, [storageKey, thumbKey]);

    file.deleteOne();
    doc.updatedBy = membershipId;
    await doc.save();

    await storage.delete(storageKey).catch(() => {});
    if (thumbKey) await storage.delete(thumbKey).catch(() => {});
    await adjustFamilyStorageBytes(familyId, -freedBytes);

    await logActivity(req, {
      action: 'document.file.delete',
      targetType: 'document',
      targetId: doc._id,
      documentId: doc._id,
      meta: { fileId: req.params.fileId },
    });

    const breadcrumbs = await loadBreadcrumbsForDoc(familyId, doc);
    res.json(serializeDocumentDetail(doc.toObject(), { breadcrumbs }));
  } catch (err) {
    next(err);
  }
});

/** POST /documents/:id/zip-link — any role; body `{ fileIds? }`, omit = all files. */
router.post('/:id/zip-link', validate({ params: idParamSchema, body: zipLinkBodySchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    const fileIds = req.body.fileIds;
    if (fileIds && fileIds.length) {
      const validIds = new Set(doc.files.map((f) => f._id.toString()));
      if (fileIds.some((id) => !validIds.has(id))) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'fileIds contains unknown file id(s)');
      }
    }

    const token = signZipToken({ scope: 'document', targetId: doc._id, familyId, fileIds });

    await logActivity(req, {
      action: 'document.zip.link',
      targetType: 'document',
      targetId: doc._id,
      documentId: doc._id,
      meta: {},
    });

    res.json({ url: `/api/files/zip/${token}` });
  } catch (err) {
    next(err);
  }
});

/** GET /documents/:id/activity — this document only. */
router.get('/:id/activity', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    const rows = await Activity.find(scopeToFamily(familyId, { documentId: doc._id }))
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({
      items: rows.map((a) => ({
        id: a._id.toString(),
        actorName: a.actorName,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId ? a.targetId.toString() : null,
        documentId: a.documentId ? a.documentId.toString() : null,
        folderId: a.folderId ? a.folderId.toString() : null,
        shareId: a.shareId ? a.shareId.toString() : null,
        meta: a.meta,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
