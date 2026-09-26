import { apiClient } from './apiClient.js';

/**
 * `/documents` — thin wrappers, no business logic. A Document is
 * `{ id, title, folderId, notes, files: [...], createdBy, createdAt, updatedAt }` (+ breadcrumbs on
 * GET /documents/:id). `notes` is stored encrypted and comes back as plain text.
 * The multipart endpoints (`create`, `addFiles`) take an optional `{ onUploadProgress }` (axios
 * progress-event callback) so callers can show an upload progress bar.
 */

function appendFiles(fd, files = [], texts = null) {
  files.forEach((file) => fd.append('files', file));
  // One label per file (the file's own name) — the server keeps it as the file's display name.
  fd.append('labels', JSON.stringify(files.map((f) => String(f.name || '').replace(/\.[^./\\]+$/, ''))));
  // The text read from each file (same order; '' for none), kept with that file.
  if (texts?.some(Boolean)) fd.append('texts', JSON.stringify(files.map((_, i) => texts[i] || '')));
  return fd;
}

export const documentsApi = {
  /** GET /documents?folderId=&page=&limit= -> { items, page, limit, total, totalPages } */
  list: (params) => apiClient.get('/documents', { params }).then((res) => res.data),

  /** GET /documents/:id -> Document (files with signed urls, breadcrumbs) */
  get: (id) => apiClient.get(`/documents/${id}`).then((res) => res.data),

  /**
   * POST /documents — multipart. `data`: { title, folderId?, notes? } (no folderId = the family's
   * Shared folder). `files`: File[] (at least one). `texts`: optional string[] — the text read
   * from each file, same order.
   */
  create: ({ data, files, texts }, { onUploadProgress } = {}) => {
    const fd = new FormData();
    fd.append('data', JSON.stringify(data));
    appendFiles(fd, files, texts);
    return apiClient
      .post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress })
      .then((res) => res.data);
  },

  /** PATCH /documents/:id — { title?, notes?, folderId? } */
  update: (id, payload) => apiClient.patch(`/documents/${id}`, payload).then((res) => res.data),

  /** DELETE /documents/:id — moves it to the Bin */
  remove: (id) => apiClient.delete(`/documents/${id}`).then((res) => res.data),

  /** POST /documents/:id/files — multipart, appends files (+ optional `texts`). Returns the updated Document. */
  addFiles: (id, { files, texts }, { onUploadProgress } = {}) =>
    apiClient
      .post(`/documents/${id}/files`, appendFiles(new FormData(), files, texts), {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
      })
      .then((res) => res.data),

  /** PATCH /documents/:id/files/:fileId/text — { text } (null or '' clears it). Returns the updated Document. */
  updateFileText: (id, fileId, text) => apiClient.patch(`/documents/${id}/files/${fileId}/text`, { text }).then((res) => res.data),

  /** DELETE /documents/:id/files/:fileId */
  removeFile: (id, fileId) => apiClient.delete(`/documents/${id}/files/${fileId}`).then((res) => res.data),

  /** POST /documents/:id/zip-link — { fileIds? } (omit = all files) -> { url } */
  zipLink: (id, fileIds) => apiClient.post(`/documents/${id}/zip-link`, fileIds ? { fileIds } : {}).then((res) => res.data),
};
