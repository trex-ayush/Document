import { apiClient } from './apiClient.js';

/** `/family` — see docs/API.md "Family & Members". Thin wrappers, no business logic. */
export const familyApi = {
  /** GET /family -> { id, name, slug, settings, storageBytes } */
  get: () => apiClient.get('/family').then((res) => res.data),

  /** PATCH /family — partial { name?, settings?: { activityRetentionDays?, requireReauthForSecrets? } } */
  update: (payload) => apiClient.patch('/family', payload).then((res) => res.data),

  /**
   * POST /family/test-email -> { queued: true, emailEnabled }. Admin only.
   * Sends a test email to the caller (never an arbitrary address) — lets an
   * admin confirm SMTP settings from Settings > Notifications. Added here
   * (was missing from the initial service set).
   */
  testEmail: () => apiClient.post('/family/test-email').then((res) => res.data),
};

export default familyApi;
