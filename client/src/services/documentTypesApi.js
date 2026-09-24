import { apiClient } from './apiClient.js';

/** `/document-types` — see docs/API.md "Document Types". Thin wrappers, no business logic. */
export const documentTypesApi = {
  /** GET /document-types -> { items: [DocumentType] } */
  list: () => apiClient.get('/document-types').then((res) => res.data),

  /** POST /document-types — { name, icon, defaultFolderId?, fields: [{key,type,sensitive}] } */
  create: (payload) => apiClient.post('/document-types', payload).then((res) => res.data),

  /** PATCH /document-types/:id — partial body of the same shape */
  update: (id, payload) => apiClient.patch(`/document-types/${id}`, payload).then((res) => res.data),

  /** DELETE /document-types/:id */
  remove: (id) => apiClient.delete(`/document-types/${id}`).then((res) => res.data),
};

export default documentTypesApi;
