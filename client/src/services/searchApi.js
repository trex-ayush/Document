import { apiClient } from './apiClient.js';

/**
 * `GET /search` — one search across folders, documents and vault items.
 *
 * `search({ q, folderId?, limit? })` resolves to
 * `{ folders: [{id, name, parentId, path}],
 *    documents: [{id, title, folderId, path, fileCount, thumbnailUrl, updatedAt, snippet}],
 *    items: [{id, kind, title, folderId, path, updatedAt, snippet}] }`.
 * `folderId` limits results to that folder and everything inside it. An empty query
 * resolves to empty groups without calling the server.
 */
export const EMPTY_RESULTS = Object.freeze({ folders: [], documents: [], items: [] });

export function search({ q, folderId, limit } = {}, { signal } = {}) {
  const query = (q || '').trim();
  if (!query) return Promise.resolve(EMPTY_RESULTS);
  const params = { q: query };
  if (folderId) params.folderId = folderId;
  if (limit) params.limit = limit;
  return apiClient.get('/search', { params, signal }).then((res) => ({
    folders: res.data?.folders || [],
    documents: res.data?.documents || [],
    items: res.data?.items || [],
  }));
}

export const searchApi = { search };

export default searchApi;
