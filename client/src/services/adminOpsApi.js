import { apiClient } from './apiClient.js';

/**
 * `/admin/*` calls for the admin panel's Activity, Shares and System tabs (docs/ADMIN_API.md).
 * Every call needs a signed-in super admin or admin (403 `NOT_PLATFORM_ADMIN` otherwise).
 * Metadata only — never file bytes, share tokens/URLs or secret values.
 *
 * Blank filter values ('' / null / undefined) are dropped before sending, so callers can pass a
 * whole filter object straight through.
 */
function clean(params = {}) {
  const out = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) out[key] = value;
  });
  return out;
}

export const adminOpsApi = {
  /**
   * GET /admin/activity?familyId=&userId=&action=&from=&to=&cursor=&limit= ->
   * { items: [{ id, at, action, actor: { id, name, email } | null, family: { id, name } | null,
   *   targetType, targetTitle }], nextCursor }
   */
  activity: (params) => apiClient.get('/admin/activity', { params: clean(params) }).then((res) => res.data),

  /**
   * GET /admin/shares?status=active|expired|revoked|all&familyId=&page=&limit= ->
   * { items: [{ id, family, targetType, targetTitle, createdBy: { name, email }, createdAt,
   *   expiresAt, revokedAt, opens, lastOpenedAt, hasPassword, status }], total, page, limit }
   */
  shares: (params) => apiClient.get('/admin/shares', { params: clean(params) }).then((res) => res.data),

  /** POST /admin/shares/:id/revoke -> the updated share row. */
  revokeShare: (id) => apiClient.post(`/admin/shares/${id}/revoke`).then((res) => res.data),

  /**
   * GET /admin/system -> { app: { commit, nodeVersion, uptimeSec, nodeEnv },
   *   config: { storageDriver, emailEnabled, smtpHost, allowedLoginMethods },
   *   db: { dataSizeBytes, storageSizeBytes, indexSizeBytes, collections: { [name]: count } },
   *   memory: { rssBytes, heapUsedBytes } }
   */
  system: () => apiClient.get('/admin/system').then((res) => res.data),

  /** GET /admin/families?q=&page=&limit= — used for the Activity page's family filter. */
  families: (params) => apiClient.get('/admin/families', { params: clean(params) }).then((res) => res.data),

  /** GET /admin/users?q=&status=&page=&limit= — used to turn a typed email into a user filter. */
  users: (params) => apiClient.get('/admin/users', { params: clean(params) }).then((res) => res.data),
};

export default adminOpsApi;
