import axios from 'axios';
import { env } from '@/config/env.js';
import { storage, STORAGE_KEYS } from './storage.js';

/**
 * Axios instance with:
 *  - Bearer auth header attached from the stored access token
 *  - 401 -> refresh-token retry with a single-flight queue (only one
 *    /auth/refresh call in flight even if N requests 401 at once)
 *  - `auth:logout` window event dispatched when refresh fails, consumed by
 *    AuthContext to clear the session and redirect to /login
 *
 * Ported from apps/component/src/services/apiClient.ts (axios refresh-queue
 * pattern), adapted to our API shape: docs/API.md's `POST /auth/refresh`
 * takes `{ refreshToken }` and returns `{ accessToken, refreshToken }` —
 * NOT `{ token, refreshToken }` like the reference implementation.
 */

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// ---------- Request: attach bearer ----------
apiClient.interceptors.request.use((config) => {
  const token = storage.getRaw(STORAGE_KEYS.accessToken);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------- Response: refresh-on-401, single-flight queue ----------
let isRefreshing = false;
let refreshQueue = []; // { resolve(token), reject(error) }

let forceLogoutFired = false;
function fireForceLogout() {
  if (forceLogoutFired) return;
  forceLogoutFired = true;
  storage.remove(STORAGE_KEYS.accessToken);
  storage.remove(STORAGE_KEYS.refreshToken);
  storage.remove(STORAGE_KEYS.user);
  storage.remove(STORAGE_KEYS.membership);
  storage.remove(STORAGE_KEYS.family);
  window.dispatchEvent(new Event('auth:logout'));
}

function isAuthEndpoint(url) {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/signup') ||
    url.includes('/auth/refresh')
  );
}

apiClient.interceptors.response.use(
  (response) => {
    // A successful response means the session is good again.
    if (forceLogoutFired) forceLogoutFired = false;
    return response;
  },
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (!original || status !== 401 || original._retry || isAuthEndpoint(original.url)) {
      return Promise.reject(error);
    }

    const refreshToken = storage.getRaw(STORAGE_KEYS.refreshToken);
    if (!refreshToken) {
      fireForceLogout();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((newToken) => {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      });
    }

    isRefreshing = true;
    original._retry = true;

    try {
      // Bare axios (not `apiClient`) — avoids re-entering these interceptors.
      const { data } = await axios.post(
        `${env.apiBaseUrl}/auth/refresh`,
        { refreshToken },
        { timeout: 30_000 },
      );

      storage.setRaw(STORAGE_KEYS.accessToken, data.accessToken);
      storage.setRaw(STORAGE_KEYS.refreshToken, data.refreshToken);

      refreshQueue.forEach(({ resolve }) => resolve(data.accessToken));
      refreshQueue = [];

      original.headers = original.headers ?? {};
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(original);
    } catch (refreshError) {
      refreshQueue.forEach(({ reject }) => reject(refreshError));
      refreshQueue = [];
      fireForceLogout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
