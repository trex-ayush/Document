import express from 'express';
import { z } from 'zod';

import { requireAuth, requireFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { searchFamily } from './search.js';

const router = express.Router();

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'q is required').max(200),
  // Omitted, empty or 'root' = search everywhere; otherwise that folder and its subfolders.
  folderId: z
    .union([z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid folderId'), z.literal('root'), z.literal('')])
    .optional()
    .transform((v) => (v && v !== 'root' ? v : null)),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

router.use(requireAuth, requireFamily);

/**
 * GET /api/search?q=&folderId=&limit=
 * -> { folders: [{id, name, parentId, path}],
 *      documents: [{id, title, folderId, path, fileCount, thumbnailUrl, updatedAt, snippet}],
 *      items: [{id, kind, title, folderId, path, updatedAt, snippet}] }
 * `limit` applies to each list separately.
 */
router.get('/', validate({ query: searchQuerySchema }), async (req, res, next) => {
  try {
    const { q, folderId, limit } = req.query;
    res.json(await searchFamily(req.auth.familyId, { q, folderId, limit }));
  } catch (err) {
    next(err);
  }
});

export default router;
