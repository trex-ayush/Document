import { apiClient } from './apiClient.js';

/**
 * `/admin/*` — the platform admin panel (docs/ADMIN_API.md). Every call needs a signed-in
 * super admin or admin; anyone else gets `403 NOT_PLATFORM_ADMIN`. Responses are metadata only
 * (names, emails, counts, sizes, dates) — never file contents, secrets or share tokens.
 *
 * The Activity / Shares / System endpoints live in `adminOpsApi.js`.
 */

/** Drop empty filters so the query string stays clean (`?q=&status=` → nothing). */
function cleanParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

export const adminApi = {
  /** GET /admin/me -> { email, role: 'super' | 'admin', isSuperAdmin } */
  me: () => apiClient.get('/admin/me').then((res) => res.data),

  /**
   * GET /admin/overview -> { counts: { users, activeUsers30d, disabledUsers, families, members,
   * invitesPending, documents, files, passwords, notes, folders, sharesActive, sharesTotal },
   * storage: { totalBytes, topFamilies: [{ id, name, bytes }] }, signups: { last7d, last30d },
   * recentActivity: [ActivityRow] }
   */
  overview: () => apiClient.get('/admin/overview').then((res) => res.data),

  /** GET /admin/users?q=&status=all|active|disabled&page=&limit= -> { items: [UserRow], total, page, limit } */
  listUsers: (params) => apiClient.get('/admin/users', { params: cleanParams(params) }).then((res) => res.data),

  /** GET /admin/users/:id -> { user: UserRow, activeSessions, recentActivity: [ActivityRow] } */
  getUser: (id) => apiClient.get(`/admin/users/${id}`).then((res) => res.data),

  /** PATCH /admin/users/:id { disabled } -> UserRow (403 for the super admin or yourself) */
  updateUser: (id, payload) => apiClient.patch(`/admin/users/${id}`, payload).then((res) => res.data),

  /** POST /admin/users/:id/logout-all -> { revoked } */
  logoutUserEverywhere: (id) => apiClient.post(`/admin/users/${id}/logout-all`).then((res) => res.data),

  /** GET /admin/families?q=&page=&limit= -> { items: [FamilyRow], total, page, limit } */
  listFamilies: (params) => apiClient.get('/admin/families', { params: cleanParams(params) }).then((res) => res.data),

  /** GET /admin/families/:id -> { family: FamilyRow, members: [...], recentActivity: [ActivityRow] } */
  getFamily: (id) => apiClient.get(`/admin/families/${id}`).then((res) => res.data),

  /** GET /admin/admins -> { superAdmin: { email, name? }, admins: [{ id, email, name?, addedBy, addedAt }] } */
  listAdmins: () => apiClient.get('/admin/admins').then((res) => res.data),

  /** POST /admin/admins { email } -> admin row (400 invalid email, 409 already an admin / the super admin) */
  addAdmin: (email) => apiClient.post('/admin/admins', { email }).then((res) => res.data),

  /** DELETE /admin/admins/:id -> 204 */
  removeAdmin: (id) => apiClient.delete(`/admin/admins/${id}`).then((res) => res.data),
};
