import { apiClient } from './apiClient.js';

/**
 * `/auth/*` — see docs/API.md "Auth — /auth". Every function is a thin
 * `apiClient` call returning `res.data`; no business logic lives here (that
 * belongs in AuthContext / hooks / components).
 */
export const authApi = {
  /** POST /auth/signup — { familyName, name, email, password } -> { user, membership, family, accessToken, refreshToken } */
  signup: (payload) => apiClient.post('/auth/signup', payload).then((res) => res.data),

  /** POST /auth/login — { email, password } -> { user, membership, family, accessToken, refreshToken } */
  login: (payload) => apiClient.post('/auth/login', payload).then((res) => res.data),

  /** POST /auth/refresh — { refreshToken } -> { accessToken, refreshToken }. Mostly used by apiClient's own interceptor. */
  refresh: (refreshToken) => apiClient.post('/auth/refresh', { refreshToken }).then((res) => res.data),

  /** POST /auth/logout — { refreshToken } -> 204 */
  logout: (refreshToken) => apiClient.post('/auth/logout', { refreshToken }).then((res) => res.data),

  /** POST /auth/logout-all -> 204 */
  logoutAll: () => apiClient.post('/auth/logout-all').then((res) => res.data),

  /** GET /auth/me -> { user, membership, family } */
  me: () => apiClient.get('/auth/me').then((res) => res.data),

  /** PATCH /auth/me — partial { name?, avatarColor? } -> updated user */
  updateMe: (payload) => apiClient.patch('/auth/me', payload).then((res) => res.data),

  /** POST /auth/change-password — { currentPassword, newPassword } -> 204 */
  changePassword: (payload) => apiClient.post('/auth/change-password', payload).then((res) => res.data),

  /** POST /auth/reauth — { password } -> { reauthToken } (5 min capability, sent back as X-Reauth) */
  reauth: (password) => apiClient.post('/auth/reauth', { password }).then((res) => res.data),

  // --- Google sign-in (Agent G, server-side — landing in docs/API.md once reported) ---

  /**
   * POST /auth/google — { credential } (the GIS ID token). On an existing
   * linked Google identity: same session shape as `login` (`{ user,
   * membership, family, accessToken, refreshToken }`). On a brand-new
   * identity: `{ needsSignup: true, signupToken, profile: { name, email,
   * avatarUrl } }` — call `googleComplete` next.
   */
  googleLogin: (credential) => apiClient.post('/auth/google', { credential }).then((res) => res.data),

  /** POST /auth/google/complete — { signupToken, familyName } -> same session shape as signup */
  googleComplete: ({ signupToken, familyName }) =>
    apiClient.post('/auth/google/complete', { signupToken, familyName }).then((res) => res.data),

  /**
   * POST /auth/google/link — { credential } -> links a Google identity to the
   * signed-in user. Not called by Login/Signup; reserved for Settings >
   * Account (Phase 2).
   */
  googleLink: (credential) => apiClient.post('/auth/google/link', { credential }).then((res) => res.data),

  /** POST /auth/google/unlink -> 204. Reserved for Settings > Account (Phase 2). */
  googleUnlink: () => apiClient.post('/auth/google/unlink').then((res) => res.data),

  /**
   * POST /auth/set-password — { newPassword } -> 204. For a Google-only
   * account adding a password sign-in option. Reserved for Settings >
   * Account (Phase 2).
   */
  setPassword: (newPassword) => apiClient.post('/auth/set-password', { newPassword }).then((res) => res.data),
};

export default authApi;
