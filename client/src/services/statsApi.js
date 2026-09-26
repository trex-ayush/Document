import { apiClient } from './apiClient.js';

/** `/stats` — thin wrapper, no business logic. */
export const statsApi = {
  /** GET /stats -> { counts: { documents, passwords, notes, folders, members } } */
  get: () => apiClient.get('/stats').then((res) => res.data),
};
