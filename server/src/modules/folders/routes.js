import express from 'express';
import { z } from 'zod';
import { Folder } from '../../models/Folder.js';
import { Document } from '../../models/Document.js';
import { requireAuth, requireFamily, requireWrite, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { serializeFolder, serializeBreadcrumbFolder } from './serializer.js';
import { getDescendantFolderIds, isSelfOrDescendant, buildBreadcrumbs } from './folderTree.js';
import { serializeDocumentSummary } from '../documents/serializer.js';
import { signZipToken } from '../files/zipTokens.js';
import { listItemsInFolder, deleteItemsInFolders, moveItemsFolderCheck } from '../items/integration.js';

const router = express.Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const parentIdInput = z.union([z.literal('root'), objectId]);

const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: parentIdInput,
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(40).optional(),
});

const patchFolderSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: parentIdInput.optional(),
  color: z.string().trim().max(20).optional(),
  icon: z.string().trim().max(40).optional(),
});

// A malformed id used to reach Mongoose as-is and surface as a 500 CastError — reject it up front.
const browseQuerySchema = z.object({
  folderId: parentIdInput.optional(),
});

const idParamSchema = z.object({ id: objectId });

const deleteQuerySchema = z.object({
  confirm: z.string().optional(),
});

router.use(requireAuth, requireFamily);

function toParentId(raw) {
  return !raw || raw === 'root' ? null : raw;
}

/** GET /folders/tree — flat list of every folder in the family, with counts. */
router.get('/tree', async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const [folders, folderCountAgg, docCountAgg] = await Promise.all([
      Folder.find(scopeToFamily(familyId)).sort({ name: 1 }).lean(),
      Folder.aggregate([
        { $match: scopeToFamily(familyId, { deletedAt: null }) },
        { $group: { _id: '$parentId', count: { $sum: 1 } } },
      ]),
      Document.aggregate([
        { $match: scopeToFamily(familyId, { deletedAt: null }) },
        { $group: { _id: '$folderId', count: { $sum: 1 } } },
      ]),
    ]);

    const folderCounts = new Map(folderCountAgg.map((r) => [r._id ? r._id.toString() : 'root', r.count]));
    const docCounts = new Map(docCountAgg.map((r) => [r._id ? r._id.toString() : 'root', r.count]));

    const items = folders.map((f) =>
      serializeFolder(f, {
        folderCount: folderCounts.get(f._id.toString()) || 0,
        documentCount: docCounts.get(f._id.toString()) || 0,
      }),
    );
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/** GET /folders/browse?folderId=root|<id> */
router.get('/browse', validate({ query: browseQuerySchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const folderId = toParentId(req.query.folderId);

    let folder = null;
    if (folderId) {
      folder = await Folder.findOne(scopeToFamily(familyId, { _id: folderId })).lean();
      if (!folder) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');
    }

    const breadcrumbs = await buildBreadcrumbs(familyId, folder);

    const [subfolders, documents, items] = await Promise.all([
      Folder.find(scopeToFamily(familyId, { parentId: folderId })).sort({ name: 1 }).lean(),
      Document.find(scopeToFamily(familyId, { folderId })).sort({ updatedAt: -1 }).lean(),
      listItemsInFolder(familyId, folderId ? String(folderId) : 'root'),
    ]);

    const subfolderIds = subfolders.map((f) => f._id.toString());
    const [folderCountAgg, docCountAgg] = await Promise.all([
      subfolderIds.length
        ? Folder.aggregate([
            { $match: scopeToFamily(familyId, { parentId: { $in: subfolders.map((f) => f._id) }, deletedAt: null }) },
            { $group: { _id: '$parentId', count: { $sum: 1 } } },
          ])
        : [],
      subfolderIds.length
        ? Document.aggregate([
            { $match: scopeToFamily(familyId, { folderId: { $in: subfolders.map((f) => f._id) }, deletedAt: null }) },
            { $group: { _id: '$folderId', count: { $sum: 1 } } },
          ])
        : [],
    ]);
    const folderCounts = new Map(folderCountAgg.map((r) => [r._id ? r._id.toString() : 'root', r.count]));
    const docCounts = new Map(docCountAgg.map((r) => [r._id ? r._id.toString() : 'root', r.count]));

    res.json({
      folder: folder ? serializeFolder(folder, {}) : null,
      breadcrumbs: breadcrumbs.map(serializeBreadcrumbFolder),
      folders: subfolders.map((f) =>
        serializeFolder(f, {
          folderCount: folderCounts.get(f._id.toString()) || 0,
          documentCount: docCounts.get(f._id.toString()) || 0,
        }),
      ),
      documents: documents.map(serializeDocumentSummary),
      items,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /folders */
router.post('/', requireWrite, validate({ body: createFolderSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const parentId = toParentId(req.body.parentId);
    if (parentId) {
      const parent = await Folder.findOne(scopeToFamily(familyId, { _id: parentId })).lean();
      if (!parent) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Parent folder not found');
    }

    const folder = await Folder.create({
      familyId,
      name: req.body.name,
      parentId,
      color: req.body.color,
      icon: req.body.icon,
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

/** PATCH /folders/:id — parentId change = move. */
router.patch('/:id', requireWrite, validate({ params: idParamSchema, body: patchFolderSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const folder = await Folder.findOne(scopeToFamily(familyId, { _id: req.params.id }));
    if (!folder) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');

    if (req.body.parentId !== undefined) {
      const targetParentId = toParentId(req.body.parentId);
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
      await moveItemsFolderCheck(familyId, folder._id);
      folder.parentId = targetParentId;
    }

    if (req.body.name !== undefined) folder.name = req.body.name;
    if (req.body.color !== undefined) folder.color = req.body.color;
    if (req.body.icon !== undefined) folder.icon = req.body.icon;
    folder.updatedBy = membershipId;
    await folder.save();

    await logActivity(req, {
      action: 'folder.update',
      targetType: 'folder',
      targetId: folder._id,
      folderId: folder._id,
      meta: { fields: Object.keys(req.body) },
    });

    res.json(serializeFolder(folder, {}));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /folders/:id?confirm=1 — recursive SOFT delete (docs/DECISIONS.md "Soft delete / recycle
 * bin"): moves this folder, every descendant subfolder, and every document/item inside any of
 * them into the family's Bin. Storage is left completely untouched — files stay counted against
 * the family's quota until a platform admin permanently purges them (modules/bin/lib.js).
 */
router.delete('/:id', requireWrite, validate({ params: idParamSchema, query: deleteQuerySchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const folder = await Folder.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!folder) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');

    const folderIds = await getDescendantFolderIds(familyId, folder._id);
    const documents = await Document.find(scopeToFamily(familyId, { folderId: { $in: folderIds } })).lean();
    const fileCount = documents.reduce((sum, d) => sum + (d.files || []).length, 0);

    if (req.query.confirm !== '1') {
      return res.status(200).json({
        requiresConfirm: true,
        folderCount: folderIds.length - 1,
        documentCount: documents.length,
        fileCount,
      });
    }

    await moveItemsFolderCheck(familyId, folder._id);

    const now = new Date();
    await Document.updateMany(
      scopeToFamily(familyId, { folderId: { $in: folderIds } }),
      { $set: { deletedAt: now, deletedBy: membershipId } },
    );
    const itemsDeleted = await deleteItemsInFolders(familyId, folderIds, membershipId);
    await Folder.updateMany(
      scopeToFamily(familyId, { _id: { $in: folderIds } }),
      { $set: { deletedAt: now, deletedBy: membershipId } },
    );

    await logActivity(req, {
      action: 'folder.delete',
      targetType: 'folder',
      targetId: folder._id,
      meta: {
        name: folder.name,
        folderCount: folderIds.length - 1,
        documentCount: documents.length,
        fileCount,
        itemsDeleted,
      },
    });

    return res.status(200).json({ requiresConfirm: false, folderCount: folderIds.length - 1, documentCount: documents.length, fileCount });
  } catch (err) {
    return next(err);
  }
});

/** POST /folders/:id/zip-link — any authenticated member with visibility (read-only can download). */
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
