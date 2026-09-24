import { apiClient } from './apiClient.js';

/** `/items` — see docs/ITEMS.md. Thin wrappers, no business logic. */
export const itemsApi = {
  /** GET /items?q=&folderId=&kind=&memberId=&tag=&page=&limit= -> { items, page, limit, total, totalPages } */
  list: (params) => apiClient.get('/items', { params }).then((res) => res.data),

  /** GET /items/:id -> full item (sensitive fields masked, hasValue: true, revealed only via reveal) */
  get: (id) => apiClient.get(`/items/${id}`).then((res) => res.data),

  /** POST /items — { title, folderId, kind, memberId?, tags?, fields? } */
  create: (payload) => apiClient.post('/items', payload).then((res) => res.data),

  /** PATCH /items/:id — partial; `fields` (when present) replaces the whole array */
  update: (id, payload) => apiClient.patch(`/items/${id}`, payload).then((res) => res.data),

  /** DELETE /items/:id */
  remove: (id) => apiClient.delete(`/items/${id}`).then((res) => res.data),

  /** GET /items/:id/activity -> { items: [Activity] } */
  activity: (id) => apiClient.get(`/items/${id}/activity`).then((res) => res.data),

  /**
   * GET /items/:id/fields/:fieldId/reveal -> { value }. When
   * `Family.settings.requireReauthForSecrets` is true, pass the 5-minute
   * `reauthToken` from `authApi.reauth()` as `reauthToken` — sent as the
   * `X-Reauth` header. Omitting it when required responds
   * `401 { code: 'REAUTH_REQUIRED' }`.
   */
  revealField: (id, fieldId, reauthToken) =>
    apiClient
      .get(`/items/${id}/fields/${fieldId}/reveal`, {
        headers: reauthToken ? { 'X-Reauth': reauthToken } : undefined,
      })
      .then((res) => res.data),
};

export default itemsApi;
