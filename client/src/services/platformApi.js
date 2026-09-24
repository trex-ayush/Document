import { apiClient } from './apiClient.js';

/**
 * `/platform-settings` — see docs/API.md "Platform settings". Deployment-wide (NOT
 * per-family) settings for the whole instance: the sign-in-method policy, and the SMTP
 * (outgoing email) configuration.
 *
 * - `GET` is public (no auth needed — the login/signup page needs it before any session
 *   exists, to decide which sign-in buttons to show). When called with a bearer token
 *   (`apiClient` attaches one automatically whenever the caller is logged in), the response
 *   also includes `isPlatformOwner: true|false` — use this to decide whether the current user
 *   should see a link to `/platform-settings` at all (e.g. in the nav). It's omitted entirely
 *   for a logged-out caller.
 * - `PATCH` requires auth, and is further gated server-side to whoever is logged in as
 *   env `PLATFORM_OWNER_EMAIL` — everyone else gets `403 FORBIDDEN`. There's no
 *   platform-super-admin role in the data model and no field anywhere that exposes who
 *   the owner is ahead of time, so this is genuinely server-side-only by design: callers
 *   should attempt the PATCH and handle a 403 gracefully rather than trying to guess
 *   ownership client-side. (`isPlatformOwner` from `GET` is a UI convenience, e.g. for the nav
 *   link — the real enforcement is always the 403 from the server.)
 *
 * SMTP fields (`host`/`port`/`secure`/`user`/`mailFrom`) follow the same "`null` = unset, falls
 * back to this deployment's env var" convention as `Family.settings.*` (see
 * `SettingsSystem.jsx`/`familyApi.js`) — `GET` returns the raw stored value, never a resolved
 * "effective" one. `hasPassword` tells the client whether a password is currently stored
 * (encrypted server-side, never sent back) so the form can show a masked placeholder instead of
 * an empty field. On `PATCH`, `smtp.pass`: omit to leave the stored password untouched, send
 * `null` to clear it (falls back to `env.SMTP_PASS`), or a non-empty string to set a new one.
 */
export const platformApi = {
  /**
   * GET /platform-settings ->
   * { allowedLoginMethods: 'google'|'password'|'both',
   *   smtp: { host, port, secure, user, mailFrom, hasPassword },
   *   isPlatformOwner?: boolean }
   */
  get: () => apiClient.get('/platform-settings').then((res) => res.data),

  /**
   * PATCH /platform-settings — partial:
   * { allowedLoginMethods?, smtp?: { host?, port?, secure?, user?, mailFrom?, pass? } }
   * (any smtp.* field may be `null` to clear it back to the env default). ->  updated settings,
   * same shape as `get()` (minus `isPlatformOwner`, which only `GET` adds). 403 if not the
   * platform owner.
   */
  update: (payload) => apiClient.patch('/platform-settings', payload).then((res) => res.data),
};

export default platformApi;
