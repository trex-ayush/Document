/**
 * Pure helpers for folders: turning `GET /folders/tree`'s flat list
 * (`{ id, name, parentId, isSystem, documentCount, folderCount }[]`) into a nested tree,
 * ancestor/descendant lookups, and the Browse list ordering.
 */

export const ROOT_ID = 'root';

/** Folder order everywhere: the system "Shared" folder first, then A→Z. */
export function compareFolders(a, b) {
  if (Boolean(a.isSystem) !== Boolean(b.isSystem)) return a.isSystem ? -1 : 1;
  return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
}

export function sortFolders(folders = []) {
  return [...folders].sort(compareFolders);
}

const timeOf = (entry) => new Date(entry.createdAt || entry.updatedAt || 0).getTime() || 0;

/**
 * One list for a folder's contents: subfolders first (Shared first, then A→Z), then documents,
 * passwords and notes mixed together, newest first. Each entry is `{ type, key, data }` with
 * `type` 'folder' | 'document' | 'item'.
 */
export function buildBrowseEntries({ folders, documents, items } = {}) {
  const folderEntries = sortFolders(folders || []).map((f) => ({ type: 'folder', key: `f-${f.id}`, data: f }));
  const rest = [
    ...(documents || []).map((d) => ({ type: 'document', key: `d-${d.id}`, data: d })),
    ...(items || []).map((i) => ({ type: 'item', key: `i-${i.id}`, data: i })),
  ].sort((a, b) => timeOf(b.data) - timeOf(a.data));
  return [...folderEntries, ...rest];
}

/** Flat list -> nested `{ ...folder, children: [...] }[]` rooted at `parentId === 'root'|null`. */
export function buildFolderTree(items = []) {
  const byId = new Map(items.map((f) => [f.id, { ...f, children: [] }]));
  const roots = [];
  byId.forEach((node) => {
    const parentId = node.parentId && node.parentId !== ROOT_ID ? node.parentId : null;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes) => {
    nodes.sort(compareFolders);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Breadcrumb-style ancestor chain (top level -> ... -> folder), from the flat list. */
export function folderPath(items = [], folderId) {
  const byId = new Map(items.map((f) => [f.id, f]));
  const path = [];
  let cur = folderId && folderId !== ROOT_ID ? byId.get(folderId) : null;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId && cur.parentId !== ROOT_ID ? byId.get(cur.parentId) : null;
  }
  return path;
}

/** All descendant ids of `folderId` (not including itself) — used to grey out invalid move targets client-side. */
export function descendantIds(items = [], folderId) {
  const childrenOf = new Map();
  items.forEach((f) => {
    const p = f.parentId && f.parentId !== ROOT_ID ? f.parentId : null;
    if (!p) return;
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p).push(f.id);
  });
  const out = new Set();
  const stack = [...(childrenOf.get(folderId) || [])];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(childrenOf.get(id) || []));
  }
  return out;
}

/**
 * The system folder is stored as "Shared" but shown in the reader's language ("साझा" in Hindi).
 * `t` can be any `useTranslation` t — the key is namespaced explicitly.
 */
export function folderName(folder, t) {
  if (!folder) return '';
  if (folder.isSystem && (!folder.systemKey || folder.systemKey === 'shared')) {
    return t ? t('browse:sharedFolder', 'Shared') : 'Shared';
  }
  return folder.name || '';
}
