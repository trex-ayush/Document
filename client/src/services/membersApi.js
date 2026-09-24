import { apiClient } from './apiClient.js';

/** `/members` — see docs/API.md "Family & Members". Thin wrappers, no business logic. */
export const membersApi = {
  /** GET /members -> { items: [Membership] } */
  list: () => apiClient.get('/members').then((res) => res.data),

  /**
   * POST /members -> 201 Membership. Two request shapes (see docs/API.md):
   *  - login-enabled: { name, relation, dob?, email, tempPassword, access }
   *  - profile-only:  { name, relation, dob?, canLogin: false }
   */
  create: (payload) => apiClient.post('/members', payload).then((res) => res.data),

  /** PATCH /members/:id — partial { name?, relation?, dob?, access?, status? } */
  update: (id, payload) => apiClient.patch(`/members/${id}`, payload).then((res) => res.data),

  /** POST /members/:id/reset-password — { newPassword } -> 204 */
  resetPassword: (id, newPassword) =>
    apiClient.post(`/members/${id}/reset-password`, { newPassword }).then((res) => res.data),

  /** DELETE /members/:id */
  remove: (id) => apiClient.delete(`/members/${id}`).then((res) => res.data),

  /**
   * POST /members/:id/resend-invite -> 204 (email module). Admin only, only
   * for a member whose `status` is `'invited'` — invalidates the old invite
   * link and sends a fresh one.
   */
  resendInvite: (id) => apiClient.post(`/members/${id}/resend-invite`).then((res) => res.data),
};

export default membersApi;
