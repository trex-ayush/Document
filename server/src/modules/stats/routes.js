import express from 'express';

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
 * `{ counts: { documents, passwords, notes, folders, members } }`. Passwords = 'login' items,
 * notes = 'note' items, folders includes Shared. Anything in the Bin is not counted.
 */
router.get('/', async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    await ensureSharedFolder(familyId);

    const [documents, passwords, notes, folders, members] = await Promise.all([
      Document.countDocuments(scopeToFamily(familyId)),
      VaultItem.countDocuments(scopeToFamily(familyId, { kind: 'login' })),
      VaultItem.countDocuments(scopeToFamily(familyId, { kind: 'note' })),
      Folder.countDocuments(scopeToFamily(familyId)),
      Membership.countDocuments(scopeToFamily(familyId)),
    ]);

    res.json({ counts: { documents, passwords, notes, folders, members } });
  } catch (err) {
    next(err);
  }
});

export default router;
