import express from 'express';
import { z } from 'zod';

import { requireAuth, requireFamily, requireWrite } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { logActivity } from '../../services/activityLogger.js';
import { listBinEntries, restoreDocument, restoreFile, restoreFolder, restoreItem } from './lib.js';

// Family-scoped Bin (docs/DECISIONS.md "Soft delete / recycle bin"): lists this family's
// soft-deleted documents/folders/items and single files (type 'file', id = the file's own id)
// and lets any WRITE member restore one. Permanent deletion
// is never reachable from here — see modules/platform/routes.js for the platform-owner-only
// cross-family purge view.
const router = express.Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const typeEnum = z.enum(['document', 'folder', 'item', 'file']);
const restoreParamsSchema = z.object({ type: typeEnum, id: objectId });

const RESTORE_ACTION = { document: 'document.restore', folder: 'folder.restore', item: 'item.restore' };

router.use(requireAuth, requireFamily);

/** GET /bin — this family's whole bin, newest-deleted first. Read access for any member. */
router.get('/', async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const items = await listBinEntries(familyId);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/** POST /bin/:type/:id/restore — takes one entry out of the bin. */
router.post('/:type/:id/restore', requireWrite, validate({ params: restoreParamsSchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const { type, id } = req.params;

    if (type === 'file') {
      const { document, file, documentRestored } = await restoreFile(familyId, id);
      await logActivity(req, {
        action: 'document.file.restore',
        targetType: 'document',
        targetId: document._id,
        documentId: document._id,
        folderId: document.folderId || null,
        meta: { fileId: id, name: file.label || file.originalName, title: document.title, documentRestored },
      });
      res.status(200).json({ restored: { type, id, documentId: String(document._id), documentRestored } });
      return;
    }

    let restored;
    if (type === 'document') restored = await restoreDocument(familyId, id);
    else if (type === 'folder') restored = await restoreFolder(familyId, id);
    else restored = await restoreItem(familyId, id);

    await logActivity(req, {
      action: RESTORE_ACTION[type],
      targetType: type,
      targetId: restored._id,
      folderId: type === 'folder' ? restored._id : restored.folderId || null,
      meta: { title: restored.title || restored.name },
    });

    res.status(200).json({ restored: { type, id } });
  } catch (err) {
    next(err);
  }
});

export default router;
