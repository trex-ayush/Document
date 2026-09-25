import { Folder } from '../../models/Folder.js';
import { scopeToFamily } from '../../middleware/auth.js';
import { ANY_DELETED_STATE } from '../../models/plugins/softDelete.js';

/**
 * All folder ids in `familyId` that are `rootFolderId` itself or a descendant of it (any depth).
 * Loads the family's whole folder set once (families have at most a few dozen folders) and walks
 * the parent->children adjacency in memory rather than doing N recursive queries.
 *
 * `includeDeleted: true` (used by the Bin module — docs/DECISIONS.md "Soft delete / recycle
 * bin") also walks soft-deleted folders, needed when restoring or permanently purging a folder
 * subtree whose descendants were cascade-soft-deleted along with it. `ANY_DELETED_STATE` matches
 * every row (missing, null or dated `deletedAt` — legacy rows have no field at all) — it exists
 * purely to give the plugin's query hook an explicit `deletedAt` key to see, which is what makes
 * it skip its own default `deletedAt: null` filter (see models/plugins/softDelete.js).
 */
export async function getDescendantFolderIds(familyId, rootFolderId, { includeDeleted = false } = {}) {
  const filter = includeDeleted ? scopeToFamily(familyId, { ...ANY_DELETED_STATE }) : scopeToFamily(familyId);
  const all = await Folder.find(filter).select('_id parentId').lean();
  const byParent = new Map();
  for (const f of all) {
    const key = f.parentId ? f.parentId.toString() : 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(f._id.toString());
  }

  const result = [];
  const stack = [String(rootFolderId)];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    result.push(cur);
    const children = byParent.get(cur) || [];
    stack.push(...children);
  }
  return result; // includes rootFolderId itself, at index 0
}

/** True if `candidateId` is `ancestorId` itself or a descendant of it. */
export async function isSelfOrDescendant(familyId, ancestorId, candidateId) {
  const ids = await getDescendantFolderIds(familyId, ancestorId);
  return ids.includes(String(candidateId));
}

/**
 * Root-first breadcrumb trail ending with `folder` itself. `folder` may be a lean Folder doc or
 * null (root) — returns [] for root.
 */
export async function buildBreadcrumbs(familyId, folder) {
  if (!folder) return [];
  const chain = [folder];
  let current = folder;
  // Bounded by folder depth (never runs away — parentId chains can't cycle since moves are
  // guarded by isSelfOrDescendant).
  while (current?.parentId) {
    // eslint-disable-next-line no-await-in-loop
    const parent = await Folder.findOne(scopeToFamily(familyId, { _id: current.parentId })).lean();
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}
