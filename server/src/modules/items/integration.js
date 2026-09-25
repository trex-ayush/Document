/**
 * Integration seam between the Items module (VaultItem: login/record/note "items") and the rest
 * of the app. Agents B, C and F call these functions rather than reaching into VaultItem/items/**
 * directly — that keeps this module a drop-in the other modules never need to touch. Signatures
 * are stable (matching the original stub) — coordinate here, not in callers, if one ever needs to
 * change.
 */
import { VaultItem } from '../../models/VaultItem.js';
import { scopeToFamily } from '../../middleware/auth.js';
import { serializeItemSummary, serializeItemForShare } from './serializer.js';

function toFolderId(raw) {
  return !raw || raw === 'root' ? null : raw;
}

/** Items directly inside one folder (for GET /browse's `items: []`). */
export async function listItemsInFolder(familyId, folderId) {
  const items = await VaultItem.find(scopeToFamily(familyId, { folderId: toFolderId(folderId) }))
    .sort({ updatedAt: -1 })
    .lean();
  return items.map(serializeItemSummary);
}

/** Items matching a search query (merged into GET /documents search results). */
export async function searchItems(familyId, q, { limit = 20 } = {}) {
  const filter = scopeToFamily(familyId, { $text: { $search: q } });
  const items = await VaultItem.find(filter, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean();
  return items.map(serializeItemSummary);
}

/** Counts per kind (login/record/note) for GET /stats' `itemsByKind`. */
export async function countItemsByKind(familyId) {
  const rows = await VaultItem.aggregate([
    { $match: scopeToFamily(familyId, { deletedAt: null }) },
    { $group: { _id: '$kind', count: { $sum: 1 } } },
  ]);
  const counts = { login: 0, record: 0, note: 0 };
  for (const row of rows) {
    if (row._id in counts) counts[row._id] = row.count;
  }
  return counts;
}

/**
 * SOFT-delete every item inside the given folders (recursive folder delete cascade — docs/
 * DECISIONS.md "Soft delete / recycle bin"). Returns count moved into the bin. `deletedBy` is
 * optional since some callers of the folders module's recursive delete may not have a live
 * membership id handy in every context.
 */
export async function deleteItemsInFolders(familyId, folderIds, deletedBy = null) {
  const res = await VaultItem.updateMany(
    scopeToFamily(familyId, { folderId: { $in: folderIds } }),
    { $set: { deletedAt: new Date(), deletedBy } },
  );
  return res.modifiedCount || 0;
}

/**
 * Throws if moving/deleting folderId would orphan items in an invalid way; no-op otherwise.
 * VaultItem.folderId is a required reference (same invariant as Document.folderId) — an item can
 * never end up without a folder, whether its folder is moved (parentId change, item's own folderId
 * is untouched) or removed (the folders module calls `deleteItemsInFolders` first for that case).
 * So there is nothing to check; kept as a documented no-op rather than removed, per the seam's
 * stable-signature contract.
 */
// eslint-disable-next-line no-unused-vars
export async function moveItemsFolderCheck(familyId, folderId) {
  // no-op
}

/**
 * Load one item for the shares module (targetType: 'item'). `includeSensitive` controls whether
 * secret field values are attached (only ever true for a share created with includeSensitive:true
 * AND a password AND <=24h expiry — the shares module enforces those invariants before calling
 * this with includeSensitive:true).
 */
export async function getItemForShare(familyId, itemId, { includeSensitive = false } = {}) {
  const item = await VaultItem.findOne(scopeToFamily(familyId, { _id: itemId })).lean();
  if (!item) return null;
  return serializeItemForShare(item, { includeSensitive });
}
