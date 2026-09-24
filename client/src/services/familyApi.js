import { apiClient } from './apiClient.js';

/** `/family` — see docs/API.md "Family & Members". Thin wrappers, no business logic. */
export const familyApi = {
  /** GET /family -> { id, name, slug, settings, storageBytes } */
  get: () => apiClient.get('/family').then((res) => res.data),

  /** PATCH /family — partial { name?, settings?: { activityRetentionDays?, requireReauthForSecrets? } } */
  update: (payload) => apiClient.patch('/family', payload).then((res) => res.data),
};

export default familyApi;
