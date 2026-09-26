import { apiClient } from './apiClient.js';

/**
 * `/bin` — this family's soft-deleted documents/folders/items (docs/DECISIONS.md "Soft delete /
 * recycle bin"). Restoring is the only write action available here — permanent deletion is a
 * platform-owner-only action, see `platformApi.js`'s `listBin`/`purgeBin`.
 */
export const binApi = {
  /**
   * GET /bin -> { items: [{ id, type: 'document'|'folder'|'item'|'file', name, deletedAt, deletedByName, ... }] }.
   * A `file` entry also has originalName, documentId, documentTitle and documentDeleted.
   */
  list: () => apiClient.get('/bin').then((res) => res.data),

  /** POST /bin/:type/:id/restore -> { restored: { type, id } } */
  restore: (type, id) => apiClient.post(`/bin/${type}/${id}/restore`).then((res) => res.data),

  /**
   * POST /bin/file/:id/restore -> { restored: { type: 'file', id, documentId, documentRestored } }.
   * Puts one deleted file back in its document (bringing the document back too if it was in the Bin).
   */
  restoreFile: (id) => apiClient.post(`/bin/file/${id}/restore`).then((res) => res.data),
};
