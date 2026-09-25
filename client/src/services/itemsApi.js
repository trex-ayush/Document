import { apiClient } from './apiClient.js';

/**
 * `/items` — passwords (`kind: 'login'`) and notes (`kind: 'note'`). Thin wrappers, no business
 * logic. An item is `{ id, kind, title, folderId, username, password, fields: [{key, value}], notes,
 * createdAt, updatedAt }`; username, password, field values and notes are encrypted at rest and
 * come back as plain text to family members. List responses leave out `password` and carry
 * `hasPassword` instead.
 */
export const itemsApi = {
  /** GET /items?folderId=&kind=&page=&limit= -> { items, page, limit, total, totalPages } */
  list: (params) => apiClient.get('/items', { params }).then((res) => res.data),

  /** GET /items/:id -> full item, including the password */
  get: (id) => apiClient.get(`/items/${id}`).then((res) => res.data),

  /** POST /items — { kind, title, folderId?, username?, password?, fields?, notes? } (no folderId = Shared) */
  create: (payload) => apiClient.post('/items', payload).then((res) => res.data),

  /** PATCH /items/:id — any of { title, folderId, username, password, fields, notes } */
  update: (id, payload) => apiClient.patch(`/items/${id}`, payload).then((res) => res.data),

  /** DELETE /items/:id — moves it to the Bin */
  remove: (id) => apiClient.delete(`/items/${id}`).then((res) => res.data),
};

export default itemsApi;
