import { apiClient } from './apiClient.js';

/**
 * `/bin` — this family's soft-deleted documents/folders/items (docs/DECISIONS.md "Soft delete /
 * recycle bin"). Restoring is the only write action available here — permanent deletion is a
 * platform-owner-only action, see `platformApi.js`'s `listBin`/`purgeBin`.
 */
export const binApi = {
  /** GET /bin -> { items: [{ id, type: 'document'|'folder'|'item', name, deletedAt }] } */
  list: () => apiClient.get('/bin').then((res) => res.data),

  /** POST /bin/:type/:id/restore -> { restored: { type, id } } */
  restore: (type, id) => apiClient.post(`/bin/${type}/${id}/restore`).then((res) => res.data),
};

export default binApi;
