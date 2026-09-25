/**
 * Pure helpers for turning `GET /folders/tree`'s flat list
 * (`{ id, name, parentId, color, icon, documentCount, folderCount }[]`)
 * into a nested tree, plus a couple of tree-shaped queries used by the
 * folder-tree sidebar/picker and by the move-folder guard.
 */

export const ROOT_ID = 'root';

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
  const sortByName = (a, b) => a.name.localeCompare(b.name);
  const sortRec = (nodes) => {
    nodes.sort(sortByName);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Breadcrumb-style ancestor chain (root -> ... -> folder), from the flat list. */
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

export const FOLDER_COLORS = [
  '#FF5A5F', '#F59E0B', '#22C55E', '#14B8A6', '#3B82F6',
  '#8B5CF6', '#EC4899', '#78716C',
];

/**
 * Folder "icon" is stored as a plain emoji string (`Folder.icon`, docs/API.md
 * `POST /folders`) — simplest thing that satisfies "icon per folder" without
 * shipping a bespoke glyph set next to the app's `lucide-react` UI icons.
 */
export const FOLDER_ICONS = ['📁', '🏠', '❤️', '💼', '🎓', '🚗', '🏥', '💰', '📄', '⚖️', '🎁', '🐾'];
export const DEFAULT_FOLDER_ICON = '📁';
