import { apiClient } from './apiClient.js';

/**
 * `/documents` — see docs/API.md "Documents". Thin wrappers, no business
 * logic. The multipart endpoints (`create`, `addFiles`, `replaceFile`)
 * accept an optional `{ onUploadProgress }` (axios progress-event callback)
 * so callers (FileDropzone consumers) can drive a per-file progress bar.
 */

function buildCreateFormData({ data, files = [], labels = [] }) {
  const fd = new FormData();
  fd.append('data', JSON.stringify(data));
  files.forEach((file) => fd.append('files', file));
  fd.append('labels', JSON.stringify(labels));
  return fd;
}

function buildAppendFormData({ files = [], labels = [] }) {
  const fd = new FormData();
  files.forEach((file) => fd.append('files', file));
  fd.append('labels', JSON.stringify(labels));
  return fd;
}

export const documentsApi = {
  /** GET /documents?q=&folderId=&memberId=&typeId=&tag=&fileKind=&page=&limit= -> { items, page, limit, total, totalPages } */
  list: (params) => apiClient.get('/documents', { params }).then((res) => res.data),

  /** GET /documents/:id -> full Document (customFields masked, files w/ signed urls, breadcrumbs) */
  get: (id) => apiClient.get(`/documents/${id}`).then((res) => res.data),

  /**
   * POST /documents — multipart. `data`: { title, folderId, typeId?, memberId?,
   * tags?, notes?, expiryDate?, customFields? }. `files`: File[]. `labels`:
   * string[] same order/length as `files`.
   */
  create: ({ data, files, labels }, { onUploadProgress } = {}) =>
    apiClient
      .post('/documents', buildCreateFormData({ data, files, labels }), {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
      })
      .then((res) => res.data),

  /** PATCH /documents/:id — partial JSON body; `customFields` (when present) replaces the whole array */
  update: (id, payload) => apiClient.patch(`/documents/${id}`, payload).then((res) => res.data),

  /** DELETE /documents/:id */
  remove: (id) => apiClient.delete(`/documents/${id}`).then((res) => res.data),

  /** POST /documents/:id/files — multipart, appends files. Returns updated Document. */
  addFiles: (id, { files, labels }, { onUploadProgress } = {}) =>
    apiClient
      .post(`/documents/${id}/files`, buildAppendFormData({ files, labels }), {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
      })
      .then((res) => res.data),

  /** PUT /documents/:id/files/:fileId — multipart single `file`, replaces bytes (keeps label/order/id) */
  replaceFile: (id, fileId, file, { onUploadProgress } = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient
      .put(`/documents/${id}/files/${fileId}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
      })
      .then((res) => res.data);
  },

  /** PATCH /documents/:id/files/:fileId — { label?, order? } */
  updateFileMeta: (id, fileId, payload) =>
    apiClient.patch(`/documents/${id}/files/${fileId}`, payload).then((res) => res.data),

  /** DELETE /documents/:id/files/:fileId */
  removeFile: (id, fileId) => apiClient.delete(`/documents/${id}/files/${fileId}`).then((res) => res.data),

  /** POST /documents/:id/zip-link — { fileIds? } (omit = all files) -> { url } */
  zipLink: (id, fileIds) => apiClient.post(`/documents/${id}/zip-link`, fileIds ? { fileIds } : {}).then((res) => res.data),

  /** GET /documents/:id/activity -> { items: [Activity] } */
  activity: (id) => apiClient.get(`/documents/${id}/activity`).then((res) => res.data),

  /**
   * GET /documents/:id/fields/:fieldId/reveal -> { value }. When
   * `Family.settings.requireReauthForSecrets` is true, pass the 5-minute
   * `reauthToken` from `authApi.reauth()` as `reauthToken` — sent as the
   * `X-Reauth` header. Omitting it when required responds
   * `401 { code: 'REAUTH_REQUIRED' }`.
   */
  revealField: (id, fieldId, reauthToken) =>
    apiClient
      .get(`/documents/${id}/fields/${fieldId}/reveal`, {
        headers: reauthToken ? { 'X-Reauth': reauthToken } : undefined,
      })
      .then((res) => res.data),
};

export default documentsApi;
