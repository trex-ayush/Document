import axios from 'axios';
import { env } from '@/config/env.js';

/**
 * `/public/*` — see docs/API.md "Public (no auth)". Uses a bare axios instance (not
 * `apiClient`) on purpose: these routes need no bearer token and must never trigger the
 * refresh-on-401 interceptor.
 */
const publicClient = axios.create({ baseURL: env.apiBaseUrl, timeout: 30_000 });

export const publicApi = {
  /**
   * GET /public/shares/:token -> { familyName, targetType, expiresAt, document?: { title, files },
   * folderTree?: { name, documents: [{ title, files }], subfolders } }. Titles and files only.
   * Errors: 410 EXPIRED/REVOKED, 404.
   */
  getShare: (token) => publicClient.get(`/public/shares/${token}`).then((res) => res.data),

  /**
   * POST /public/shares/:token/zip-link — the response body IS the ZIP (`application/zip`), not
   * JSON, so `responseType: 'blob'` is required. Returns the `Blob`.
   */
  zipLink: (token) =>
    publicClient.post(`/public/shares/${token}/zip-link`, {}, { responseType: 'blob' }).then((res) => res.data),
};

export default publicApi;
