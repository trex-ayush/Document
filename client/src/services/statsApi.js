import { apiClient } from './apiClient.js';

/** `/stats` — see docs/API.md "Activity & Stats". Thin wrapper, no business logic. */
export const statsApi = {
  /** GET /stats -> { counts, itemsByKind, recentDocuments, recentActivity, expiringSoon } */
  get: () => apiClient.get('/stats').then((res) => res.data),
};

export default statsApi;
