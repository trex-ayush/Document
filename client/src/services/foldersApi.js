import { apiClient } from './apiClient.js';

/** `/folders` (incl. `/folders/browse`) — see docs/API.md "Folders". Thin wrappers, no business logic. */
export const foldersApi = {
  /** GET /folders/tree -> { items: [{ id, name, parentId, color, icon, documentCount, folderCount }] } */
  tree: () => apiClient.get('/folders/tree').then((res) => res.data),

  /**
   * GET /folders/browse?folderId=root|<id> -> { folder, breadcrumbs, folders, documents, items }
   * Omit `folderId` (or pass 'root') for the top level.
   */
  browse: (folderId) =>
    apiClient
      .get('/folders/browse', { params: folderId ? { folderId } : undefined })
      .then((res) => res.data),

  /** POST /folders — { name, parentId: 'root'|'<id>', color?, icon? } */
  create: (payload) => apiClient.post('/folders', payload).then((res) => res.data),

  /** PATCH /folders/:id — partial { name?, parentId?, color?, icon? } (parentId change = move) */
  update: (id, payload) => apiClient.patch(`/folders/${id}`, payload).then((res) => res.data),

  /**
   * DELETE /folders/:id — recursive delete. Without `confirm`, the server
   * returns `{ requiresConfirm: true, folderCount, documentCount, fileCount }`
   * (200) instead of deleting; call again with `confirm: true` to proceed.
   */
  remove: (id, { confirm = false } = {}) =>
    apiClient
      .delete(`/folders/${id}`, { params: confirm ? { confirm: 1 } : undefined })
      .then((res) => res.data),

  /** POST /folders/:id/zip-link -> { url } (short-lived signed ZIP download) */
  zipLink: (id) => apiClient.post(`/folders/${id}/zip-link`).then((res) => res.data),
};

export default foldersApi;
