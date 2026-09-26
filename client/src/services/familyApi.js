import { apiClient } from './apiClient.js';

/** `/family` — see docs/API.md "Family & Members". Thin wrappers, no business logic. */
export const familyApi = {
  /**
   * POST /family — { familyName } -> { family, membership }. No `X-Family-Id`
   * needed (docs/API.md "Multi-family sessions"). Creates a new Family +
   * owner/admin Membership for the caller, used by both the first-run
   * "Create your family" onboarding screen (`pages/Onboarding.jsx`, shown
   * when `GET /auth/me` returns `memberships: []`) and the family switcher's
   * "+ Create a new family" action (`components/layout/FamilySwitcher.jsx`)
   * for an existing user. Added here (was missing from the initial service
   * set, predating multi-family).
   */
  create: (familyName) => apiClient.post('/family', { familyName }).then((res) => res.data),

  /**
   * GET /family -> { id, name, slug, defaultShareDuration: '12h'|'24h'|'7d', storageBytes,
   * emailEnabled }. Any member can read it (the share dialog uses the default duration). Upload/storage/activity limits and the storage driver are
   * platform-admin-only and live on `/platform-settings` (see `platformApi.js`).
   */
  get: () => apiClient.get('/family').then((res) => res.data),

  /**
   * PATCH /family (admin) — partial { name?, defaultShareDuration?: '12h'|'24h'|'7d' }.
   */
  update: (payload) => apiClient.patch('/family', payload).then((res) => res.data),

  /**
   * POST /family/test-email -> { queued: true, emailEnabled }. Admin only.
   * Sends a test email to the caller (never an arbitrary address) — lets an
   * admin confirm SMTP settings from Settings > Notifications. Added here
   * (was missing from the initial service set).
   */
  testEmail: () => apiClient.post('/family/test-email').then((res) => res.data),
};
