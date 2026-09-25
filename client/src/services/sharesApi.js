import { apiClient } from './apiClient.js';

/** `/shares` — see docs/API.md "Shares". Thin wrappers, no business logic. */
export const sharesApi = {
  /** GET /shares -> { items: [Share] } — Share: { id, targetType, targetId, targetLabel, expiresAt, revokedAt, openCount, createdAt, ... } */
  list: (params) => apiClient.get('/shares', { params }).then((res) => res.data),

  /**
   * POST /shares -> 201 { ...Share, url } — `url` (the raw share link) is ONLY ever returned
   * here, right after creation; it can't be recovered from `list` later.
   * Body: { targetType: 'document'|'folder', targetId, fileIds?, duration?: '12h'|'24h'|'7d' }
   * (no duration = the family's default).
   */
  create: (payload) => apiClient.post('/shares', payload).then((res) => res.data),

  /** PATCH /shares/:id — { revoke: true } turns the link off immediately. */
  revoke: (id) => apiClient.patch(`/shares/${id}`, { revoke: true }).then((res) => res.data),

  /** DELETE /shares/:id — removes the record (owner/admin only). */
  remove: (id) => apiClient.delete(`/shares/${id}`).then((res) => res.data),
};

export default sharesApi;
