import { apiClient } from './apiClient.js';

/** `/members` — see docs/API.md "Family & Members". Thin wrappers, no business logic. */
export const membersApi = {
  /** GET /members -> { items: [Membership] } */
  list: () => apiClient.get('/members').then((res) => res.data),

  /**
   * POST /members { name, email } -> 201 Membership (access 'write' by default) + `invite: { url, expiresAt, emailSent }`.
   * The person is always invited (see docs/API.md for the optional/legacy fields).
   */
  create: (payload) => apiClient.post('/members', payload).then((res) => res.data),

  /**
   * POST /members/:id/invite-link { resend? } -> { url, expiresAt, emailSent }. Admin only, only
   * for a pending (`status: 'invited'`) member. Makes a NEW link (older links stop working);
   * `resend: true` also emails it.
   */
  inviteLink: (id, { resend = false } = {}) =>
    apiClient.post(`/members/${id}/invite-link`, { resend }).then((res) => res.data),

  /** PATCH /members/:id — partial { name?, access?: 'read'|'write', status?: 'active'|'disabled' } */
  update: (id, payload) => apiClient.patch(`/members/${id}`, payload).then((res) => res.data),

  /** POST /members/:id/reset-password — { newPassword } -> 204 */
  resetPassword: (id, newPassword) =>
    apiClient.post(`/members/${id}/reset-password`, { newPassword }).then((res) => res.data),

  /** DELETE /members/:id */
  remove: (id) => apiClient.delete(`/members/${id}`).then((res) => res.data),

  /**
   * POST /members/:id/resend-invite -> 204 (email module). Admin only, only
   * for a member whose `status` is `'invited'` — invalidates the old invite
   * link and sends a fresh one. Prefer `inviteLink(id, { resend: true })`,
   * which does the same and also returns the link.
   */
  resendInvite: (id) => apiClient.post(`/members/${id}/resend-invite`).then((res) => res.data),
};
