import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';

import { Document } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';
import { DocumentType } from '../../models/DocumentType.js';
import { Membership } from '../../models/Membership.js';
import { Family } from '../../models/Family.js';
import { Activity } from '../../models/Activity.js';
import { requireAuth, requireFamily, requireWrite, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { getStorage, makeStorageKey } from '../../storage/index.js';
import { encryptFileBuffer, encryptFieldValue, decryptFieldValue } from '../../utils/crypto.js';
import { verifyReauthToken } from '../../utils/tokens.js';

import { serializeDocumentSummary, serializeDocumentDetail } from './serializer.js';
import { validateAndProcessFile } from './fileValidation.js';
import { shouldLogView } from './viewThrottle.js';
import { totalStoredBytes, adjustFamilyStorageBytes } from './storageAccounting.js';
import { getEffectiveFamilySettings } from '../../utils/effectiveSettings.js';
import { buildBreadcrumbs } from '../folders/folderTree.js';
import { signZipToken } from '../files/zipTokens.js';
import { searchItems } from '../items/integration.js';

const router = express.Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const fieldTypeEnum = z.enum(['text', 'number', 'date', 'email', 'phone', 'url']);
// A document may live at the top level (no folder): `null`, `'root'` or omitted all mean that.
const folderIdInput = z.union([objectId, z.literal('root')]).nullable();
const toFolderId = (raw) => (!raw || raw === 'root' ? null : raw);

const customFieldInputSchema = z.object({
  key: z.string().trim().min(1).max(120),
  value: z.union([z.string(), z.number()]).optional().default(''),
  type: fieldTypeEnum.optional().default('text'),
  sensitive: z.boolean().optional().default(false),
});

const createDocumentDataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  folderId: folderIdInput.optional(),
  typeId: objectId.nullable().optional(),
  memberId: objectId.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).optional().default([]),
  notes: z.string().max(5000).optional().default(''),
  expiryDate: z.string().nullable().optional(),
  customFields: z.array(customFieldInputSchema).optional().default([]),
});

const patchDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  folderId: folderIdInput.optional(),
  typeId: objectId.nullable().optional(),
  memberId: objectId.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).optional(),
  notes: z.string().max(5000).optional(),
  expiryDate: z.string().nullable().optional(),
  customFields: z.array(customFieldInputSchema).optional(),
});

const listQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  folderId: z.string().optional(),
  // `none` = only documents not tied to any member (memberId: null — the "Shared" documents).
  memberId: z.union([objectId, z.literal('none')]).optional(),
  typeId: objectId.optional(),
  tag: z.string().optional(),
  fileKind: z.enum(['image', 'pdf']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const idParamSchema = z.object({ id: objectId });
const fileIdParamSchema = z.object({ id: objectId, fileId: objectId });
const fieldIdParamSchema = z.object({ id: objectId, fieldId: objectId });

const patchFileSchema = z.object({
  label: z.string().trim().max(200).optional(),
  order: z.coerce.number().int().min(0).optional(),
});

const zipLinkBodySchema = z.object({ fileIds: z.array(objectId).optional() });

// Rate-limited per member (see docs/API.md GET /documents/:id/fields/:fieldId/reveal).
const revealLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.membershipId || req.ip,
});

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
const uploadSingleFile = uploadMiddleware([{ name: 'file', maxCount: 1 }]);

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

function parseDateOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid date');
  return d;
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

/** Sensitive fields are encrypted at rest; non-sensitive stored as plain strings. */
function buildCustomFieldSubdocs(fields) {
  return (fields || []).map((f, idx) => ({
    key: f.key,
    value: f.sensitive ? encryptFieldValue(String(f.value ?? '')) : String(f.value ?? ''),
    type: f.type,
    sensitive: Boolean(f.sensitive),
    order: idx,
  }));
}

async function assertFolderExists(familyId, folderId) {
  const folder = await Folder.findOne(scopeToFamily(familyId, { _id: folderId })).lean();
  if (!folder) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');
  return folder;
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

/** GET /documents?q=&folderId=&memberId=&typeId=&tag=&fileKind=&page=&limit= */
router.get('/', validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const { q, folderId, memberId, typeId, tag, fileKind, page, limit } = req.query;

    const filter = scopeToFamily(familyId, {});
    if (folderId) filter.folderId = folderId === 'root' ? null : folderId;
    if (memberId) filter.memberId = memberId === 'none' ? null : memberId;
    if (typeId) filter.typeId = typeId;
    if (tag) filter.tags = tag;
    if (fileKind === 'image') filter['files.mimeType'] = { $regex: '^image/' };
    if (fileKind === 'pdf') filter['files.mimeType'] = 'application/pdf';

    let sort = { updatedAt: -1 };
    let projection = null;
    if (q) {
      filter.$text = { $search: q };
      projection = { score: { $meta: 'textScore' } };
      sort = { score: { $meta: 'textScore' } };
    }

    const skip = (page - 1) * limit;
    const [docs, total, itemResults] = await Promise.all([
      Document.find(filter, projection).sort(sort).skip(skip).limit(limit).lean(),
      Document.countDocuments(filter),
      q ? searchItems(familyId, q, { limit: 10 }) : Promise.resolve([]),
    ]);

    res.json({
      items: docs.map(serializeDocumentSummary),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      // Merged item-module search results for the frontend's global search box — see this
      // module's report to the lead for the docs/API.md addition this needs.
      itemResults,
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

    const folderId = toFolderId(data.folderId);
    const folder = folderId ? await assertFolderExists(familyId, folderId) : null;

    if (data.typeId) {
      const exists = await DocumentType.exists(scopeToFamily(familyId, { _id: data.typeId }));
      if (!exists) throw new ApiError(404, 'DOCUMENT_TYPE_NOT_FOUND', 'Document type not found');
    }
    if (data.memberId) {
      const exists = await Membership.exists(scopeToFamily(familyId, { _id: data.memberId }));
      if (!exists) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    }

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
      folderId,
      title: data.title,
      typeId: data.typeId || null,
      memberId: data.memberId || null,
      tags: data.tags,
      notes: data.notes,
      expiryDate: parseDateOrNull(data.expiryDate) || null,
      customFields: buildCustomFieldSubdocs(data.customFields),
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

/** PATCH /documents/:id — customFields (if present) REPLACES the whole array. */
router.patch('/:id', requireWrite, validate({ params: idParamSchema, body: patchDocumentSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id }));
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    const body = req.body;
    if (body.folderId !== undefined) {
      const folderId = toFolderId(body.folderId);
      if (folderId) await assertFolderExists(familyId, folderId);
      doc.folderId = folderId;
    }
    if (body.typeId !== undefined) {
      if (body.typeId) {
        const exists = await DocumentType.exists(scopeToFamily(familyId, { _id: body.typeId }));
        if (!exists) throw new ApiError(404, 'DOCUMENT_TYPE_NOT_FOUND', 'Document type not found');
      }
      doc.typeId = body.typeId || null;
    }
    if (body.memberId !== undefined) {
      if (body.memberId) {
        const exists = await Membership.exists(scopeToFamily(familyId, { _id: body.memberId }));
        if (!exists) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Member not found');
      }
      doc.memberId = body.memberId || null;
    }
    if (body.title !== undefined) doc.title = body.title;
    if (body.tags !== undefined) doc.tags = body.tags;
    if (body.notes !== undefined) doc.notes = body.notes;
    if (body.expiryDate !== undefined) doc.expiryDate = parseDateOrNull(body.expiryDate);

    let changedFieldKeys = null;
    if (body.customFields !== undefined) {
      doc.customFields = buildCustomFieldSubdocs(body.customFields);
      changedFieldKeys = doc.customFields.map((f) => f.key);
    }

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
    if (changedFieldKeys) {
      await logActivity(req, {
        action: 'field.update',
        targetType: 'document',
        targetId: doc._id,
        documentId: doc._id,
        meta: { keys: changedFieldKeys },
      });
    }

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

/** PUT /documents/:id/files/:fileId — replaces bytes, keeps label/order/id. */
router.put('/:id/files/:fileId', requireWrite, validate({ params: fileIdParamSchema }), uploadSingleFile, async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id }));
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    const file = doc.files.id(req.params.fileId);
    if (!file) throw new ApiError(404, 'FILE_NOT_FOUND', 'File not found');

    const uploadedFile = req.files?.file?.[0];
    if (!uploadedFile) throw new ApiError(400, 'VALIDATION_ERROR', '"file" is required');

    const maxFileMB = req.uploadMaxFileMB;
    const processed = await validateAndProcessFile(uploadedFile.buffer, uploadedFile.originalname, maxFileMB);
    const storage = await getStorage();
    const { subdoc: newSubdoc, storedBytes: newBytes } = await persistFile(
      storage,
      familyId,
      membershipId,
      processed,
      file.label,
      file.order,
    );

    const oldStorageKey = file.storageKey;
    const oldThumbKey = file.thumbKey;
    const oldBytes = await totalStoredBytes(storage, [oldStorageKey, oldThumbKey]);

    file.storageKey = newSubdoc.storageKey;
    file.thumbKey = newSubdoc.thumbKey;
    file.originalName = newSubdoc.originalName;
    file.mimeType = newSubdoc.mimeType;
    file.size = newSubdoc.size;
    file.width = newSubdoc.width;
    file.height = newSubdoc.height;
    file.encryption = newSubdoc.encryption;
    file.thumbEncryption = newSubdoc.thumbEncryption;
    file.uploadedBy = membershipId;
    file.uploadedAt = newSubdoc.uploadedAt;

    doc.updatedBy = membershipId;
    await doc.save();

    await storage.delete(oldStorageKey).catch(() => {});
    if (oldThumbKey) await storage.delete(oldThumbKey).catch(() => {});
    await adjustFamilyStorageBytes(familyId, newBytes - oldBytes);

    await logActivity(req, {
      action: 'document.file.replace',
      targetType: 'document',
      targetId: doc._id,
      documentId: doc._id,
      folderId: doc.folderId,
      meta: { fileId: String(file._id) },
    });

    const breadcrumbs = await loadBreadcrumbsForDoc(familyId, doc);
    res.json(serializeDocumentDetail(doc.toObject(), { breadcrumbs }));
  } catch (err) {
    next(err);
  }
});

/** PATCH /documents/:id/files/:fileId — label/order only. */
router.patch('/:id/files/:fileId', requireWrite, validate({ params: fileIdParamSchema, body: patchFileSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id }));
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    const file = doc.files.id(req.params.fileId);
    if (!file) throw new ApiError(404, 'FILE_NOT_FOUND', 'File not found');

    if (req.body.label !== undefined) file.label = req.body.label;
    if (req.body.order !== undefined) file.order = req.body.order;
    doc.updatedBy = membershipId;
    await doc.save();

    await logActivity(req, {
      action: 'document.file.update',
      targetType: 'document',
      targetId: doc._id,
      documentId: doc._id,
      meta: { fileId: String(file._id), fields: Object.keys(req.body) },
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

/** GET /documents/:id/fields/:fieldId/reveal — the ONLY route that ever returns plaintext. */
router.get('/:id/fields/:fieldId/reveal', revealLimiter, validate({ params: fieldIdParamSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const doc = await Document.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!doc) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

    const field = (doc.customFields || []).find((f) => f._id.toString() === req.params.fieldId);
    if (!field) throw new ApiError(404, 'FIELD_NOT_FOUND', 'Field not found');

    if (field.sensitive) {
      const family = await Family.findById(familyId).select('settings').lean();
      if (family?.settings?.requireReauthForSecrets) {
        const header = req.headers['x-reauth'];
        let reauth;
        try {
          if (!header) throw new Error('missing');
          reauth = verifyReauthToken(header);
        } catch {
          throw new ApiError(401, 'REAUTH_REQUIRED', 'Re-authentication required');
        }
        if (reauth.membershipId !== membershipId || reauth.familyId !== familyId) {
          throw new ApiError(401, 'REAUTH_REQUIRED', 'Re-authentication required');
        }
      }
    }

    const value = field.sensitive ? (field.value ? decryptFieldValue(field.value) : '') : field.value;

    await logActivity(req, {
      action: 'field.reveal',
      targetType: 'document',
      targetId: doc._id,
      documentId: doc._id,
      meta: { key: field.key },
    });

    res.json({ value });
  } catch (err) {
    next(err);
  }
});

export default router;
