import axios from 'axios';
import { env } from '@/config/env.js';

/**
 * `/public/*` — see docs/API.md "Public (no auth)". Uses a bare axios
 * instance (not `apiClient`) on purpose: these routes need no bearer token
 * and must never trigger the refresh-on-401 interceptor (401 here means
 * "wrong share password", not "expired session").
 */
const publicClient = axios.create({ baseURL: env.apiBaseUrl, timeout: 30_000 });

export const publicApi = {
  /**
   * GET /public/shares/:token. Pass `password` when the share is
   * password-protected (sent as the `X-Share-Password` header).
   * Errors: 401 PASSWORD_REQUIRED/PASSWORD_INVALID, 429 TOO_MANY_ATTEMPTS,
   * 410 EXPIRED/REVOKED, 404.
   */
  getShare: (token, password) =>
    publicClient
      .get(`/public/shares/${token}`, {
        headers: password ? { 'X-Share-Password': password } : undefined,
      })
      .then((res) => res.data),

  /**
   * POST /public/shares/:token/zip-link — same header/auth model. Unlike
   * every other endpoint in this file, the response body IS the ZIP itself
   * (`Content-Type: application/zip`), not JSON (docs/API.md: "streams the
   * ZIP directly as the response body ... rather than returning `{ url }`")
   * — `responseType: 'blob'` is required here or axios mangles the binary
   * body trying to parse it as JSON/text (this was missing from the
   * original stub; added as a correctness fix, not a new function). Returns
   * the `Blob` directly; the caller builds an object URL to save it.
   * `403` if the share's `allowDownload` is false.
   */
  zipLink: (token, password) =>
    publicClient
      .post(
        `/public/shares/${token}/zip-link`,
        {},
        {
          headers: password ? { 'X-Share-Password': password } : undefined,
          responseType: 'blob',
        },
      )
      .then((res) => res.data),
};

export default publicApi;
