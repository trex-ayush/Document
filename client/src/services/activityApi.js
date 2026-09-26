import { apiClient } from './apiClient.js';

/** `/activity` — see docs/API.md "Activity & Stats". Thin wrapper, no business logic. */
export const activityApi = {
  /** GET /activity?memberId=&action=&from=&to=&cursor=&limit= -> { items: [Activity], nextCursor } */
  list: (params) => apiClient.get('/activity', { params }).then((res) => res.data),
};
