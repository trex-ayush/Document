import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEYS, storage } from '@/services/storage.js';
import { authApi } from '@/services/authApi.js';

/**
 * Auth/session context. Ported from apps/component/src/context/AuthContext.tsx
 * (types stripped), adapted to our API shape:
 *
 *  - `GET /auth/me` and the signup/login responses all carry `{ user,
 *    membership, family }` (three separate entities, not one flattened
 *    `user`) — docs/API.md. All three are stored and exposed.
 *  - Value shape requested by the build plan: `{ user, membership, family,
 *    isAuthenticated, loading, login, signup, logout, logoutAll, updateUser }`,
 *    plus `loginWithGoogle`/`completeGoogleSignup` for the Google sign-in
 *    flow (see pages/auth/GoogleSignInButton.jsx and services/authApi.js).
 */

const AuthContext = createContext(null);

function persistSession(session) {
  const { user, membership, family, accessToken, refreshToken } = session;
  storage.setRaw(STORAGE_KEYS.accessToken, accessToken);
  if (refreshToken) storage.setRaw(STORAGE_KEYS.refreshToken, refreshToken);
  storage.set(STORAGE_KEYS.user, user);
  storage.set(STORAGE_KEYS.membership, membership);
  storage.set(STORAGE_KEYS.family, family);
  return { user, membership, family };
}

function clearSession() {
  storage.remove(STORAGE_KEYS.accessToken);
  storage.remove(STORAGE_KEYS.refreshToken);
  storage.remove(STORAGE_KEYS.user);
  storage.remove(STORAGE_KEYS.membership);
  storage.remove(STORAGE_KEYS.family);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => storage.get(STORAGE_KEYS.user));
  const [membership, setMembership] = useState(() => storage.get(STORAGE_KEYS.membership));
  const [family, setFamily] = useState(() => storage.get(STORAGE_KEYS.family));
  const [loading, setLoading] = useState(true);

  // Validate the stored access token on mount (also fills in membership/family
  // if only a stale/partial session was cached).
  useEffect(() => {
    const token = storage.getRaw(STORAGE_KEYS.accessToken);
    if (!token) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    authApi
      .me()
      .then((fresh) => {
        if (cancelled) return;
        setUser(fresh.user);
        setMembership(fresh.membership);
        setFamily(fresh.family);
        storage.set(STORAGE_KEYS.user, fresh.user);
        storage.set(STORAGE_KEYS.membership, fresh.membership);
        storage.set(STORAGE_KEYS.family, fresh.family);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setUser(null);
        setMembership(null);
        setFamily(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Force-logout fired by apiClient's interceptor when refresh fails.
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setMembership(null);
      setFamily(null);
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  const applySession = useCallback((session) => {
    const next = persistSession(session);
    setUser(next.user);
    setMembership(next.membership);
    setFamily(next.family);
    return next;
  }, []);

  const login = useCallback(
    async (payload) => {
      const session = await authApi.login(payload);
      return applySession(session);
    },
    [applySession],
  );

  const signup = useCallback(
    async (payload) => {
      const session = await authApi.signup(payload);
      return applySession(session);
    },
    [applySession],
  );

  /**
   * POST /auth/google. Returns the applied `{ user, membership, family }`
   * session on an existing linked identity, or passes through
   * `{ needsSignup: true, signupToken, profile }` unchanged (no session to
   * apply yet) for the caller to hand to `completeGoogleSignup`.
   */
  const loginWithGoogle = useCallback(
    async (credential) => {
      const result = await authApi.googleLogin(credential);
      if (result?.needsSignup) return result;
      return applySession(result);
    },
    [applySession],
  );

  const completeGoogleSignup = useCallback(
    async ({ signupToken, familyName }) => {
      const session = await authApi.googleComplete({ signupToken, familyName });
      return applySession(session);
    },
    [applySession],
  );

  /**
   * Email module: POST /auth/accept-invite — { token, password? } -> same
   * session shape as login/signup, applied immediately so a just-accepted
   * invite signs the new member straight in (see pages/auth/AcceptInvite.jsx).
   */
  const acceptInvite = useCallback(
    async ({ token, password }) => {
      const session = await authApi.acceptInvite({ token, password });
      return applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    const refreshToken = storage.getRaw(STORAGE_KEYS.refreshToken);
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // Server-side revoke is best-effort; always clear locally.
    }
    clearSession();
    setUser(null);
    setMembership(null);
    setFamily(null);
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await authApi.logoutAll();
    } finally {
      clearSession();
      setUser(null);
      setMembership(null);
      setFamily(null);
    }
  }, []);

  const updateUser = useCallback((next) => {
    setUser(next);
    storage.set(STORAGE_KEYS.user, next);
  }, []);

  const value = useMemo(
    () => ({
      user,
      membership,
      family,
      isAuthenticated: user !== null,
      loading,
      login,
      signup,
      loginWithGoogle,
      completeGoogleSignup,
      acceptInvite,
      logout,
      logoutAll,
      updateUser,
    }),
    [
      user,
      membership,
      family,
      loading,
      login,
      signup,
      loginWithGoogle,
      completeGoogleSignup,
      acceptInvite,
      logout,
      logoutAll,
      updateUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Access the current auth session: `{ user, membership, family,
 * isAuthenticated, loading, login, signup, logout, logoutAll, updateUser }`
 * (plus `loginWithGoogle`/`completeGoogleSignup`/`acceptInvite`).
 * Must be used under `<AuthProvider>` (mounted in main.jsx).
 *
 * @example
 * const { user, isAuthenticated, login, logout } = useAuth();
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
