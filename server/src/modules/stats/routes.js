import express from 'express';
import mongoose from 'mongoose';

import { requireAuth, requireFamily, scopeToFamily } from '../../middleware/auth.js';
import { Document } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';
import { Membership } from '../../models/Membership.js';
import { VaultItem } from '../../models/VaultItem.js';
import { ensureSharedFolder } from '../folders/sharedFolder.js';

const router = express.Router();

router.use(requireAuth, requireFamily);

/**
 * GET /stats — the Home screen counts:
 * `{ counts: { documents, files, passwords, notes, folders, members } }`. Files = the files in
 * those documents; passwords = 'login' items, notes = 'note' items, folders includes Shared.
 * Anything in the Bin is not counted (a single file moved to the Bin has `files.deletedAt`).
 */
router.get('/', async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    await ensureSharedFolder(familyId);

    const [documents, fileAgg, passwords, notes, folders, members] = await Promise.all([
      Document.countDocuments(scopeToFamily(familyId)),
      // Aggregations skip the soft-delete plugin, so the Bin filters are written out here.
      Document.aggregate([
        { $match: { familyId: new mongoose.Types.ObjectId(String(familyId)), deletedAt: null } },
        { $group: { _id: null, n: { $sum: { $size: { $filter: { input: { $ifNull: ['$files', []] }, as: 'f', cond: { $not: [{ $ifNull: ['$$f.deletedAt', false] }] } } } } } } },
      ]),
      VaultItem.countDocuments(scopeToFamily(familyId, { kind: 'login' })),
      VaultItem.countDocuments(scopeToFamily(familyId, { kind: 'note' })),
      Folder.countDocuments(scopeToFamily(familyId)),
      Membership.countDocuments(scopeToFamily(familyId)),
    ]);

    const files = fileAgg[0]?.n || 0;
    res.json({ counts: { documents, files, passwords, notes, folders, members } });
  } catch (err) {
    next(err);
  }
});

export default router;
