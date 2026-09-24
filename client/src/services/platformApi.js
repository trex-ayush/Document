import { apiClient } from './apiClient.js';

/**
 * `/platform-settings` — see docs/API.md "Platform settings". Deployment-wide (NOT
 * per-family) sign-in-method policy for the whole instance.
 *
 * - `GET` is public (no auth needed — the login/signup page needs it before any session
 *   exists, to decide which sign-in buttons to show).
 * - `PATCH` requires auth, and is further gated server-side to whoever is logged in as
 *   env `PLATFORM_OWNER_EMAIL` — everyone else gets `403 FORBIDDEN`. There's no
 *   platform-super-admin role in the data model and no field anywhere that exposes who
 *   the owner is, so this is genuinely server-side-only by design: callers should attempt
 *   the PATCH and handle a 403 gracefully rather than trying to guess ownership client-side.
 */
export const platformApi = {
  /** GET /platform-settings -> { allowedLoginMethods: 'google'|'password'|'both' } */
  get: () => apiClient.get('/platform-settings').then((res) => res.data),

  /** PATCH /platform-settings — { allowedLoginMethods } -> updated { allowedLoginMethods }. 403 if not the platform owner. */
  update: (payload) => apiClient.patch('/platform-settings', payload).then((res) => res.data),
};

export default platformApi;
