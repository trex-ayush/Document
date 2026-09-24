/**
 * Type-safe-ish wrapper around localStorage. Returns `null` on missing/parse
 * failure instead of throwing, and swallows write errors (private mode, quota
 * exceeded, storage disabled) instead of crashing the app.
 *
 * Ported from apps/component/src/utils/storage.ts, stripped of TS generics.
 */
export const storage = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage may be full or unavailable — caller may retry, nothing to do here.
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },

  // Convenience for raw string values (tokens).
  getRaw(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setRaw(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};

/**
 * Fixed localStorage keys used across the app. `theme` MUST stay in sync with
 * the literal string `'family-vault-theme'` hardcoded in client/index.html's
 * pre-mount dark-mode script — do not change one without the other.
 */
export const STORAGE_KEYS = {
  accessToken: 'family-vault-access-token',
  refreshToken: 'family-vault-refresh-token',
  user: 'family-vault-user',
  // Legacy single-family keys — no longer written (multi-family accounts:
  // see docs/DECISIONS.md), kept only so `AuthContext`'s `clearSession()` can
  // still wipe them from a browser that has an old session cached.
  membership: 'family-vault-membership',
  family: 'family-vault-family',
  // Multi-family: the full membership list (`GET /auth/me` / login / signup
  // response) and which one is "active" client-side. See docs/API.md
  // "Multi-family sessions".
  memberships: 'family-vault-memberships',
  activeFamilyId: 'family-vault-active-family',
  theme: 'family-vault-theme',
};
