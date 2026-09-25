/** `{ id, name, parentId, isSystem, documentCount, itemCount, folderCount }`. */
export function serializeFolder(folder, counts = {}) {
  return {
    id: folder._id.toString(),
    name: folder.name,
    parentId: folder.parentId ? folder.parentId.toString() : null,
    isSystem: Boolean(folder.isSystem),
    documentCount: counts.documentCount || 0,
    itemCount: counts.itemCount || 0,
    folderCount: counts.folderCount || 0,
  };
}

/** Breadcrumb entries don't need live counts — keep them cheap (no per-ancestor count queries). */
export function serializeBreadcrumbFolder(folder) {
  return {
    id: folder._id.toString(),
    name: folder.name,
    parentId: folder.parentId ? folder.parentId.toString() : null,
    isSystem: Boolean(folder.isSystem),
  };
}
