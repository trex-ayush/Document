import { env } from '@/config/env.js';

/**
 * `/files` — URL helpers only. `GET /files/:signedToken` streams raw bytes
 * (not JSON), so it's never called through `apiClient`/axios — it's used
 * directly as an `<img src>`, `<a href>`, or `window.location` target using
 * the signed `url`/`thumbUrl`/`downloadUrl` already embedded in every
 * document/folder/file response (see docs/API.md "File tokens"). These
 * helpers just resolve relative URLs against the API base and build
 * force-download links.
 */
export const filesApi = {
  /**
   * Makes a server-issued file URL absolute. The server returns root-relative paths that already
   * include `/api` (e.g. `/api/files/eyJ...`), so they resolve against the API's ORIGIN — joining
   * them onto `apiBaseUrl` (which also ends in `/api`) would produce `/api/api/files/...` (404).
   */
  resolveUrl(url) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    try {
      return new URL(url, env.apiBaseUrl).href;
    } catch {
      return url;
    }
  },

  /** Same URL with `?download=1` appended, so the server sends `Content-Disposition: attachment`. */
  getForceDownloadUrl(url) {
    const resolved = filesApi.resolveUrl(url);
    if (!resolved) return resolved;
    if (/[?&]download=1(&|$)/.test(resolved)) return resolved;
    return `${resolved}${resolved.includes('?') ? '&' : '?'}download=1`;
  },

  /** Triggers a browser download of a signed file URL via a throwaway <a download>. */
  triggerDownload(url, filename) {
    const resolved = filesApi.getForceDownloadUrl(url);
    if (!resolved) return;
    const a = document.createElement('a');
    a.href = resolved;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};

export default filesApi;
