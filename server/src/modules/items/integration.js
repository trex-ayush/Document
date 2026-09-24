/**
 * Integration seam between the Items module (VaultItem: login/record/note "items") and the rest
 * of the app. Agents B, C and F call these functions rather than reaching into VaultItem/items/**
 * directly — that keeps the items module a drop-in the Items agent can fill in without touching
 * (or being blocked by) any other module's files.
 *
 * Stub implementations return empty/no-op values so every caller works today and starts
 * returning real data the moment the Items agent replaces this file's bodies (signatures must
 * stay stable — coordinate a signature change here rather than breaking callers).
 */

/** Items directly inside one folder (for GET /browse's `items: []`). */
// eslint-disable-next-line no-unused-vars
export async function listItemsInFolder(familyId, folderId) {
  return [];
}

/** Items matching a search query (merged into GET /documents search results). */
// eslint-disable-next-line no-unused-vars
export async function searchItems(familyId, q, { limit = 20 } = {}) {
  return [];
}

/** Counts per kind (login/record/note) for GET /stats' `itemsByKind`. */
// eslint-disable-next-line no-unused-vars
export async function countItemsByKind(familyId) {
  return {};
}

/** Delete every item inside the given folders (recursive folder delete). Returns count removed. */
// eslint-disable-next-line no-unused-vars
export async function deleteItemsInFolders(familyId, folderIds) {
  return 0;
}

/** Throws if moving/deleting folderId would orphan items in an invalid way; no-op otherwise. */
// eslint-disable-next-line no-unused-vars
export async function moveItemsFolderCheck(familyId, folderId) {
  // no-op stub
}

/**
 * Load one item for the shares module (targetType: 'item'). `includeSensitive` controls whether
 * secret field values are attached (only ever true for a share created with includeSensitive:true
 * AND a password AND <=24h expiry — the shares module enforces those invariants before calling
 * this with includeSensitive:true).
 */
// eslint-disable-next-line no-unused-vars
export async function getItemForShare(familyId, itemId, { includeSensitive = false } = {}) {
  return null;
}
