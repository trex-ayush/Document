import express from 'express';
import { z } from 'zod';
import { Folder } from '../../models/Folder.js';
import { Document, activeFiles } from '../../models/Document.js';
import { VaultItem } from '../../models/VaultItem.js';
import { requireAuth, requireFamily, requireWrite, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { serializeFolder, serializeBreadcrumbFolder } from './serializer.js';
import { getDescendantFolderIds, isSelfOrDescendant, buildBreadcrumbs } from './folderTree.js';
import { ensureSharedFolder, isSystemFolder, isReservedFolderName } from './sharedFolder.js';
import { serializeDocumentSummary } from '../documents/serializer.js';
import { serializeItemSummary } from '../items/serializer.js';
import { signZipToken } from '../files/zipTokens.js';

const router = express.Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const parentIdInput = z.union([z.literal('root'), objectId]);

// A folder is a name only (no colour/icon).
const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: parentIdInput.optional().default('root'),
});

const patchFolderSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: parentIdInput.optional(),
});

// A malformed id used to reach Mongoose as-is and surface as a 500 CastError — reject it up front.
const browseQuerySchema = z.object({
  folderId: parentIdInput.optional(),
});

const idParamSchema = z.object({ id: objectId });

const deleteQuerySchema = z.object({
  confirm: z.string().optional(),
});

function systemFolderError() {
  return new ApiError(400, 'SYSTEM_FOLDER', 'The Shared folder cannot be renamed, moved or deleted');
}

function reservedNameError() {
  return new ApiError(400, 'RESERVED_FOLDER_NAME', '"Shared" is the name of your family\'s Shared folder — please choose another name');
}

/** Shared first, then A→Z. */
function sortFolders(folders) {
  return [...folders].sort((a, b) => {
    if (Boolean(a.isSystem) !== Boolean(b.isSystem)) return a.isSystem ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Per-folder counts of direct subfolders / documents / items, for the given parent ids (or the
 * whole family when `folderObjectIds` is omitted). aggregate() bypasses the soft-delete plugin,
 * so the bin is excluded by hand.
 */
async function countChildren(familyId, folderObjectIds) {
  const inFolders = folderObjectIds ? { $in: folderObjectIds } : { $ne: null };
  const group = (key) => [{ $group: { _id: `$${key}`, count: { $sum: 1 } } }];
  const [folderAgg, docAgg, itemAgg] = await Promise.all([
    Folder.aggregate([{ $match: scopeToFamily(familyId, { parentId: inFolders, deletedAt: null }) }, ...group('parentId')]),
    Document.aggregate([{ $match: scopeToFamily(familyId, { folderId: inFolders, deletedAt: null }) }, ...group('folderId')]),
    VaultItem.aggregate([{ $match: scopeToFamily(familyId, { folderId: inFolders, deletedAt: null }) }, ...group('folderId')]),
  ]);
  const toMap = (rows) => new Map(rows.map((r) => [String(r._id), r.count]));
  const folderCounts = toMap(folderAgg);
  const docCounts = toMap(docAgg);
  const itemCounts = toMap(itemAgg);
  return (id) => ({
    folderCount: folderCounts.get(String(id)) || 0,
    documentCount: docCounts.get(String(id)) || 0,
    itemCount: itemCounts.get(String(id)) || 0,
  });
}

router.use(requireAuth, requireFamily);

/** GET /folders/tree — flat list of every folder in the family, with counts. */
router.get('/tree', async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    await ensureSharedFolder(familyId);
    const [folders, countsOf] = await Promise.all([
      Folder.find(scopeToFamily(familyId)).lean(),
      countChildren(familyId),
    ]);

    res.json({ items: sortFolders(folders).map((f) => serializeFolder(f, countsOf(f._id))) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /folders/browse?folderId=root|<id> — one level of the tree. The top level holds only
 * folders (Shared + the family's own), so `documents` and `items` are always empty there.
 */
router.get('/browse', validate({ query: browseQuerySchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const folderId = !req.query.folderId || req.query.folderId === 'root' ? null : req.query.folderId;

    let folder = null;
    if (folderId) {
      folder = await Folder.findOne(scopeToFamily(familyId, { _id: folderId })).lean();
      if (!folder) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');
    } else {
      await ensureSharedFolder(familyId);
    }

    const [breadcrumbs, subfolders, documents, items] = await Promise.all([
      buildBreadcrumbs(familyId, folder),
      Folder.find(scopeToFamily(familyId, { parentId: folderId })).lean(),
      folderId ? Document.find(scopeToFamily(familyId, { folderId })).sort({ updatedAt: -1 }).lean() : [],
      folderId ? VaultItem.find(scopeToFamily(familyId, { folderId })).sort({ updatedAt: -1 }).lean() : [],
    ]);

    const countsOf = subfolders.length
      ? await countChildren(familyId, subfolders.map((f) => f._id))
      : () => ({});

    res.json({
      folder: folder ? serializeFolder(folder, {}) : null,
      breadcrumbs: breadcrumbs.map(serializeBreadcrumbFolder),
      folders: sortFolders(subfolders).map((f) => serializeFolder(f, countsOf(f._id))),
      documents: documents.map(serializeDocumentSummary),
      items: items.map(serializeItemSummary),
    });
  } catch (err) {
    next(err);
  }
});

/** POST /folders — `{ name, parentId? }` (parentId omitted/'root' = top level). */
router.post('/', requireWrite, validate({ body: createFolderSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    if (isReservedFolderName(req.body.name)) throw reservedNameError();
    const parentId = req.body.parentId === 'root' ? null : req.body.parentId;
    if (parentId) {
      const parent = await Folder.findOne(scopeToFamily(familyId, { _id: parentId })).lean();
      if (!parent) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Parent folder not found');
    }

    const folder = await Folder.create({
      familyId,
      name: req.body.name,
      parentId,
      createdBy: membershipId,
    });

    await logActivity(req, {
      action: 'folder.create',
      targetType: 'folder',
      targetId: folder._id,
      folderId: folder._id,
      meta: { name: folder.name },
    });

    res.status(201).json(serializeFolder(folder, {}));
  } catch (err) {
    next(err);
  }
});

/** PATCH /folders/:id — rename (`name`) and/or move (`parentId`). Never the Shared folder. */
router.patch('/:id', requireWrite, validate({ params: idParamSchema, body: patchFolderSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const folder = await Folder.findOne(scopeToFamily(familyId, { _id: req.params.id }));
    if (!folder) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');
    if (isSystemFolder(folder)) throw systemFolderError();
    // Re-sending an older folder's unchanged name (e.g. alongside a move) is left alone.
    if (req.body.name !== undefined && req.body.name !== folder.name && isReservedFolderName(req.body.name)) {
      throw reservedNameError();
    }

    if (req.body.parentId !== undefined) {
      const targetParentId = req.body.parentId === 'root' ? null : req.body.parentId;
      if (targetParentId) {
        if (targetParentId === String(folder._id)) {
          throw new ApiError(400, 'CANNOT_MOVE_INTO_DESCENDANT', 'A folder cannot be moved into itself');
        }
        const targetParent = await Folder.findOne(scopeToFamily(familyId, { _id: targetParentId })).lean();
        if (!targetParent) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Target folder not found');
        if (await isSelfOrDescendant(familyId, folder._id, targetParentId)) {
          throw new ApiError(400, 'CANNOT_MOVE_INTO_DESCENDANT', 'Cannot move a folder into its own descendant');
        }
      }
      folder.parentId = targetParentId;
    }

    if (req.body.name !== undefined) folder.name = req.body.name;
    folder.updatedBy = membershipId;
    await folder.save();

    await logActivity(req, {
      action: 'folder.update',
      targetType: 'folder',
      targetId: folder._id,
      folderId: folder._id,
      meta: { name: folder.name, fields: Object.keys(req.body) },
    });

    res.json(serializeFolder(folder, {}));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /folders/:id?confirm=1 — recursive SOFT delete (docs/DECISIONS.md "Soft delete / recycle
 * bin"): moves this folder, every descendant subfolder, and every document/item inside any of
 * them into the family's Bin. Without `confirm=1` it only returns what would be removed. Storage
 * is left untouched until a platform admin permanently purges (modules/bin/lib.js). The Shared
 * folder can never be deleted.
 */
router.delete('/:id', requireWrite, validate({ params: idParamSchema, query: deleteQuerySchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const folder = await Folder.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!folder) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');
    if (isSystemFolder(folder)) throw systemFolderError();

    const folderIds = await getDescendantFolderIds(familyId, folder._id);
    const inFolders = scopeToFamily(familyId, { folderId: { $in: folderIds } });
    const [documents, itemCount] = await Promise.all([
      Document.find(inFolders).select('files').lean(),
      VaultItem.countDocuments(inFolders),
    ]);
    const fileCount = documents.reduce((sum, d) => sum + activeFiles(d).length, 0);
    const summary = {
      folderCount: folderIds.length - 1,
      documentCount: documents.length,
      itemCount,
      fileCount,
    };

    if (req.query.confirm !== '1') {
      return res.status(200).json({ requiresConfirm: true, ...summary });
    }

    const binned = { $set: { deletedAt: new Date(), deletedBy: membershipId } };
    await Document.updateMany(inFolders, binned);
    await VaultItem.updateMany(inFolders, binned);
    await Folder.updateMany(scopeToFamily(familyId, { _id: { $in: folderIds } }), binned);

    await logActivity(req, {
      action: 'folder.delete',
      targetType: 'folder',
      targetId: folder._id,
      meta: { name: folder.name, ...summary },
    });

    return res.status(200).json({ requiresConfirm: false, ...summary });
  } catch (err) {
    return next(err);
  }
});

/** POST /folders/:id/zip-link — any member can download a folder's files as a ZIP. */
router.post('/:id/zip-link', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const folder = await Folder.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!folder) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');

    const token = signZipToken({ scope: 'folder', targetId: folder._id, familyId });

    await logActivity(req, {
      action: 'folder.zip.link',
      targetType: 'folder',
      targetId: folder._id,
      folderId: folder._id,
      meta: {},
    });

    res.json({ url: `/api/files/zip/${token}` });
  } catch (err) {
    next(err);
  }
});

export default router;
