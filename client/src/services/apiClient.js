import axios from 'axios';
import { env } from '@/config/env.js';
import { storage, STORAGE_KEYS } from './storage.js';
import { clearActivity, isIdleExpired } from './idleSession.js';
import {
  WAKE_REQUEST_TIMEOUT_MS,
  isServerAwake,
  markServerAwake,
  noteServerError,
  waitForServerAwake,
} from './serverWake.js';
import { shouldRetryDuringWake } from './serverWakeTiming.js';

/**
 * Axios instance with:
 *  - Bearer auth header attached from the stored access token
 *  - `X-Family-Id` header attached from the "active family id" (multi-family
 *    accounts — docs/API.md "Multi-family sessions") whenever one is set
 *  - 401 -> refresh-token retry with a single-flight queue (only one
 *    /auth/refresh call in flight even if N requests 401 at once)
 *  - `auth:logout` window event dispatched when refresh fails, consumed by
 *    AuthContext to clear the session and redirect to /login
 *  - no silent refresh once the session is idle (60 min without real user
 *    activity, see services/idleSession.js): the session is signed out instead
 *  - server warm-up (services/serverWake.js): requests sent before the sleeping
 *    server has answered get a longer timeout, and reads (GET/HEAD only) that
 *    failed because it was still starting are retried quietly, at most twice,
 *    once it is awake — so no error toast for a cold start
 *
 * Ported from apps/component/src/services/apiClient.ts (axios refresh-queue
 * pattern), adapted to our API shape: docs/API.md's `POST /auth/refresh`
 * takes `{ refreshToken }` and returns `{ accessToken, refreshToken }` —
 * NOT `{ token, refreshToken }` like the reference implementation.
 *
 * ---
 * ### Active family id
 *
 * The access token no longer says "which family" (docs/API.md) — every
 * family-scoped request needs an `X-Family-Id` header, and the client tracks
 * that "active family id" itself. To avoid a circular import (AuthContext
 * needs `apiClient`, so `apiClient` must not need `AuthContext`), this module
 * owns that one piece of state directly: `getActiveFamilyId()`/
 * `setActiveFamilyId(id)` are the only public surface. `AuthContext` calls
 * `setActiveFamilyId` whenever the active family changes (on login/signup,
 * `switchFamily`, `createFamily`, logout); this interceptor just reads
 * whatever was last set and attaches it, or omits the header entirely when
 * nothing is set yet (right after login before a family is picked, or during
 * onboarding — matches the endpoints docs/API.md marks family-agnostic).
 */

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

let activeFamilyId = storage.getRaw(STORAGE_KEYS.activeFamilyId) || null;

/** Current "active family id" (persisted in localStorage), or `null` if none is set yet. */
export function getActiveFamilyId() {
  return activeFamilyId;
}

/**
 * Sets (or clears, with `null`/`undefined`) the active family id. Persists to
 * localStorage so it survives a refresh and future requests attach it
 * automatically. Called by `AuthContext` only — nothing else should need to
 * touch this.
 */
export function setActiveFamilyId(id) {
  activeFamilyId = id || null;
  if (activeFamilyId) {
    storage.setRaw(STORAGE_KEYS.activeFamilyId, activeFamilyId);
  } else {
    storage.remove(STORAGE_KEYS.activeFamilyId);
  }
}

// ---------- Request: attach bearer + active family ----------
apiClient.interceptors.request.use((config) => {
  const token = storage.getRaw(STORAGE_KEYS.accessToken);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (activeFamilyId) {
    config.headers = config.headers ?? {};
    config.headers['X-Family-Id'] = activeFamilyId;
  }
  // The server may still be waking up (~1 minute): give the request time to be answered.
  if (!isServerAwake()) {
    config._sentBeforeAwake = true;
    if (config.timeout && config.timeout < WAKE_REQUEST_TIMEOUT_MS) config.timeout = WAKE_REQUEST_TIMEOUT_MS;
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
  clearActivity();
  storage.remove(STORAGE_KEYS.accessToken);
  storage.remove(STORAGE_KEYS.refreshToken);
  storage.remove(STORAGE_KEYS.user);
  storage.remove(STORAGE_KEYS.membership);
  storage.remove(STORAGE_KEYS.family);
  storage.remove(STORAGE_KEYS.memberships);
  setActiveFamilyId(null);
  window.dispatchEvent(new Event('auth:logout'));
}

function isAuthEndpoint(url) {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/signup') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout')
  );
}

apiClient.interceptors.response.use(
  (response) => {
    markServerAwake();
    // A successful response means the session is good again.
    if (forceLogoutFired) forceLogoutFired = false;
    return response;
  },
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    noteServerError(error);
    // Failed only because the server was still starting: wait for it, then retry — reads only.
    if (
      original &&
      shouldRetryDuringWake({
        method: original.method,
        sentBeforeAwake: original._sentBeforeAwake,
        retries: original._wakeRetries || 0,
        code: error.code,
        status,
        hasResponse: Boolean(error.response),
      })
    ) {
      original._wakeRetries = (original._wakeRetries || 0) + 1;
      await waitForServerAwake();
      return apiClient(original);
    }

    if (!original || status !== 401 || original._retry || isAuthEndpoint(original.url)) {
      return Promise.reject(error);
    }

    // Idle for too long: never extend the session silently — sign out instead.
    if (isIdleExpired()) {
      fireForceLogout();
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
      // Includes the server's own 60-minute idle limit (401 SESSION_EXPIRED): a quiet sign-out
      // back to the login page.
      fireForceLogout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
