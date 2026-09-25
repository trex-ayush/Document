import { apiClient } from './apiClient.js';

/** `/folders` (incl. `/folders/browse`) — see docs/API.md "Folders". Thin wrappers, no business logic. */
export const foldersApi = {
  /** GET /folders/tree -> { items: [{ id, name, parentId, isSystem, systemKey, documentCount, folderCount }] } */
  tree: () => apiClient.get('/folders/tree').then((res) => res.data),

  /**
   * GET /folders/browse?folderId=root|<id> -> { folder, breadcrumbs, folders, documents, items }
   * Omit `folderId` (or pass 'root') for the top level, which holds folders only. Every folder
   * carries `isSystem` (true only for the family's "Shared" folder).
   */
  browse: (folderId) =>
    apiClient
      .get('/folders/browse', { params: folderId ? { folderId } : undefined })
      .then((res) => res.data),

  /** POST /folders — { name, parentId: 'root'|'<id>' } */
  create: (payload) => apiClient.post('/folders', payload).then((res) => res.data),

  /**
   * PATCH /folders/:id — partial { name?, parentId? } (parentId change = move). The system
   * "Shared" folder can't be renamed/moved (400 SYSTEM_FOLDER).
   */
  update: (id, payload) => apiClient.patch(`/folders/${id}`, payload).then((res) => res.data),

  /**
   * DELETE /folders/:id — recursive delete. Without `confirm`, the server
   * returns `{ requiresConfirm: true, folderCount, documentCount, fileCount }`
   * (200) instead of deleting; call again with `confirm: true` to proceed. Everything moves to
   * the Bin. The system "Shared" folder can't be deleted (400 SYSTEM_FOLDER).
   */
  remove: (id, { confirm = false } = {}) =>
    apiClient
      .delete(`/folders/${id}`, { params: confirm ? { confirm: 1 } : undefined })
      .then((res) => res.data),
};

export default foldersApi;
