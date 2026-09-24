import express from 'express';

import { requireAuth, scopeToFamily } from '../../middleware/auth.js';
import { Document } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';
import { Membership } from '../../models/Membership.js';
import { Share } from '../../models/Share.js';
import { Family } from '../../models/Family.js';
import { Activity } from '../../models/Activity.js';
import { countItemsByKind } from '../items/integration.js';
import { serializeActivity } from '../activity/serialize.js';
// The documents module (Agent B) has landed its own DocumentSummary serializer — reuse it rather
// than keeping a duplicate here, so recentDocuments/expiringSoon never drift from the shape
// GET /documents returns. (Earlier drafts of this file duplicated this logic while that module
// was still a stub — see the final report's notes.)
import { serializeDocumentSummary } from '../documents/serializer.js';

const router = express.Router();

const RECENT_LIMIT = 5;
const EXPIRING_SOON_DAYS = 60;
const EXPIRING_SOON_LIMIT = 20;

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const now = new Date();
    const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

    const [
      documentsCount,
      foldersCount,
      membersCount,
      activeShares,
      family,
      itemsByKind,
      recentDocs,
      recentActivityRows,
      expiringDocs,
    ] = await Promise.all([
      Document.countDocuments(scopeToFamily(familyId)),
      Folder.countDocuments(scopeToFamily(familyId)),
      Membership.countDocuments(scopeToFamily(familyId)),
      Share.countDocuments(
        scopeToFamily(familyId, { revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }),
      ),
      Family.findById(familyId).select('storageBytes').lean(),
      countItemsByKind(familyId),
      Document.find(scopeToFamily(familyId)).sort({ updatedAt: -1 }).limit(RECENT_LIMIT).lean(),
      Activity.find(scopeToFamily(familyId)).sort({ createdAt: -1 }).limit(RECENT_LIMIT).lean(),
      Document.find(scopeToFamily(familyId, { expiryDate: { $gte: now, $lte: soon } }))
        .sort({ expiryDate: 1 })
        .limit(EXPIRING_SOON_LIMIT)
        .lean(),
    ]);

    res.json({
      counts: {
        documents: documentsCount,
        folders: foldersCount,
        members: membersCount,
        activeShares,
        // Kept up to date by the documents/files module as files are added/removed — see
        // REQUESTED SHARED CHANGES in this agent's final report if it drifts from reality.
        storageBytes: family?.storageBytes || 0,
        storageLimitBytes: null,
      },
      itemsByKind: itemsByKind || {},
      recentDocuments: recentDocs.map(serializeDocumentSummary),
      recentActivity: recentActivityRows.map(serializeActivity),
      expiringSoon: expiringDocs.map(serializeDocumentSummary),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
