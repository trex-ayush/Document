import { apiClient } from './apiClient.js';

/** `/shares` — see docs/API.md "Shares". Thin wrappers, no business logic. */
export const sharesApi = {
  /** GET /shares?targetId=&status=(active|expired|revoked) -> { items: [Share] } */
  list: (params) => apiClient.get('/shares', { params }).then((res) => res.data),

  /**
   * POST /shares -> 201 { ...Share, url } — `url` (the raw share link) is
   * ONLY ever returned here, right after creation. Callers must show/copy it
   * immediately; it can't be recovered from `list`/`get` later.
   * Body: { targetType: 'document'|'folder'|'item', targetId, fileIds?,
   *         expiresIn: '1h'|'2h'|'24h'|'7d'|'30d'|'never', allowDownload?,
   *         password?, label?, includeSensitive? }
   */
  create: (payload) => apiClient.post('/shares', payload).then((res) => res.data),

  /** PATCH /shares/:id — { revoke?: true, extendTo?, label? } */
  update: (id, payload) => apiClient.patch(`/shares/${id}`, payload).then((res) => res.data),

  /** DELETE /shares/:id — hard delete (owner/admin only) */
  remove: (id) => apiClient.delete(`/shares/${id}`).then((res) => res.data),

  /** GET /shares/:id/access-log -> { items: [{ time, ipHash, device, browser, action }] } */
  accessLog: (id) => apiClient.get(`/shares/${id}/access-log`).then((res) => res.data),
};

export default sharesApi;
