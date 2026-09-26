import { apiClient } from './apiClient.js';

/**
 * `/me` — see docs/API.md "Notification preferences — /me". Admin only
 * (server enforces `requireAdmin`; only admins receive instant alert
 * emails). Added here (was missing from the initial service set) for the
 * Settings > Notifications tab.
 */
export const meApi = {
  /** GET /me/notification-prefs -> { instant: { [eventKey]: boolean } } (missing/unset keys default true) */
  getNotificationPrefs: () => apiClient.get('/me/notification-prefs').then((res) => res.data),

  /** PATCH /me/notification-prefs — { instant: { [eventKey]: boolean, ... } } (merges) -> updated { instant } */
  updateNotificationPrefs: (payload) =>
    apiClient.patch('/me/notification-prefs', payload).then((res) => res.data),
};
