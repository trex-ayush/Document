import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEYS, storage } from '@/services/storage.js';
import { authApi } from '@/services/authApi.js';
import { familyApi } from '@/services/familyApi.js';
import { getActiveFamilyId, setActiveFamilyId as persistActiveFamilyId } from '@/services/apiClient.js';

/**
 * Auth/session context. Ported from apps/component/src/context/AuthContext.tsx
 * (types stripped), adapted to our API shape and extended for **multi-family
 * accounts** (docs/API.md "Multi-family sessions", docs/DECISIONS.md
 * "Multi-family accounts") — a `User` can hold a `Membership` in any number
 * of `Family` records, and the access token no longer says "which family".
 *
 *  - `memberships`: the full list from `GET /auth/me` / login / signup
 *    (`[{ id, familyId, familyName, role, access, isOwner, status }]`).
 *  - `activeFamilyId`: which one is "current" client-side — persisted to
 *    localStorage (via `services/apiClient.js`'s `getActiveFamilyId`/
 *    `setActiveFamilyId`, which is what actually attaches the `X-Family-Id`
 *    header) and defaulting to the last-used one if still a member, else the
 *    first membership.
 *  - `activeMembership`/`activeFamily`: derived from `memberships` +
 *    `activeFamilyId`. `activeFamily` is synthesized as `{ id: familyId, name:
 *    familyName }` (that's all a Membership row carries per docs/API.md) and
 *    then enriched in the background with the full `GET /family` response
 *    (slug/settings/storageBytes/emailEnabled) once that resolves — existing
 *    pages that read e.g. `family.emailEnabled` (Members.jsx) keep working
 *    unchanged, just one tick later than `family.name`.
 *  - `switchFamily(familyId)` / `createFamily(familyName)`: see their own
 *    doc comments below.
 *  - **Backward compatibility**: `membership`/`family` are still exported as
 *    aliases of `activeMembership`/`activeFamily` — every already-built page
 *    that does `const {membership, family} = useAuth()` keeps working with
 *    zero changes.
 *
 * Value shape: `{ user, memberships, activeFamilyId, activeMembership,
 * activeFamily, membership, family, isAuthenticated, loading, login, signup,
 * loginWithGoogle, completeGoogleSignup, acceptInvite, switchFamily,
 * createFamily, logout, logoutAll, updateUser }`.
 */

const AuthContext = createContext(null);

/** Picks the active family id after a login/signup/refresh: keep the persisted
 * one if it's still a membership, else fall back to the first membership,
 * else `null` (zero memberships -> onboarding). */
function pickActiveFamilyId(memberships, persistedId) {
  if (!memberships || memberships.length === 0) return null;
  if (persistedId && memberships.some((m) => m.familyId === persistedId)) return persistedId;
  return memberships[0].familyId;
}

function persistSession(session) {
  const { user, memberships, accessToken, refreshToken } = session;
  storage.setRaw(STORAGE_KEYS.accessToken, accessToken);
  if (refreshToken) storage.setRaw(STORAGE_KEYS.refreshToken, refreshToken);
  storage.set(STORAGE_KEYS.user, user);
  storage.set(STORAGE_KEYS.memberships, memberships || []);
  return { user, memberships: memberships || [] };
}

function clearSession() {
  storage.remove(STORAGE_KEYS.accessToken);
  storage.remove(STORAGE_KEYS.refreshToken);
  storage.remove(STORAGE_KEYS.user);
  storage.remove(STORAGE_KEYS.memberships);
  // Legacy single-family keys — no longer written, but wipe them too in case
  // this browser has an old pre-multi-family session cached.
  storage.remove(STORAGE_KEYS.membership);
  storage.remove(STORAGE_KEYS.family);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => storage.get(STORAGE_KEYS.user));
  const [memberships, setMemberships] = useState(() => storage.get(STORAGE_KEYS.memberships) || []);
  const [activeFamilyId, setActiveFamilyIdState] = useState(() => getActiveFamilyId());
  const [familyDetail, setFamilyDetail] = useState(null); // lazy GET /family enrichment, see activeFamily below
  const [loading, setLoading] = useState(true);

  // Validate the stored access token on mount (also fills in memberships if
  // only a stale/partial session was cached).
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
        const nextMemberships = fresh.memberships || [];
        setUser(fresh.user);
        setMemberships(nextMemberships);
        storage.set(STORAGE_KEYS.user, fresh.user);
        storage.set(STORAGE_KEYS.memberships, nextMemberships);

        const nextActiveId = pickActiveFamilyId(nextMemberships, getActiveFamilyId());
        persistActiveFamilyId(nextActiveId);
        setActiveFamilyIdState(nextActiveId);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        persistActiveFamilyId(null);
        setUser(null);
        setMemberships([]);
        setActiveFamilyIdState(null);
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
      setMemberships([]);
      setActiveFamilyIdState(null);
      setFamilyDetail(null);
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  // Lazily enrich the active family with the full `GET /family` response
  // (slug/settings/storageBytes/emailEnabled) — a Membership row only carries
  // `familyId`/`familyName`. Silent no-op on failure (e.g. mid-onboarding
  // with no active family yet); `activeFamily` below still works from the
  // synthesized `{id, name}` shape either way.
  useEffect(() => {
    if (!activeFamilyId) {
      setFamilyDetail(null);
      return undefined;
    }
    let cancelled = false;
    familyApi
      .get()
      .then((data) => {
        if (!cancelled) setFamilyDetail(data);
      })
      .catch(() => {
        if (!cancelled) setFamilyDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFamilyId]);

  const applySession = useCallback((session) => {
    const next = persistSession(session);
    setUser(next.user);
    setMemberships(next.memberships);

    const nextActiveId = pickActiveFamilyId(next.memberships, getActiveFamilyId());
    persistActiveFamilyId(nextActiveId);
    setActiveFamilyIdState(nextActiveId);

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
   * POST /auth/google. Returns the applied `{ user, memberships }` session on
   * an existing linked identity, or passes through `{ needsSignup: true,
   * signupToken, profile }` unchanged (no session to apply yet) for the
   * caller to hand to `completeGoogleSignup`.
   */
  const loginWithGoogle = useCallback(
    async (credential) => {
      const result = await authApi.googleLogin(credential);
      if (result?.needsSignup) return result;
      return applySession(result);
    },
    [applySession],
  );

  /**
   * POST /auth/google/complete — { signupToken } -> applies the returned
   * session. No `familyName` param anymore (multi-family: docs/API.md) — a
   * brand-new Google identity just creates the User and, like every other
   * cold signup, lands with `memberships: []` (onboarding shows next).
   */
  const completeGoogleSignup = useCallback(
    async (signupToken) => {
      const session = await authApi.googleComplete(signupToken);
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

  /**
   * Switches the active family: validates `familyId` is one of the user's own
   * memberships, persists it (`services/apiClient.js`'s `setActiveFamilyId`,
   * which is what every subsequent request's `X-Family-Id` header reads from)
   * and updates state. Returns `true` on success, `false` if `familyId` isn't
   * a membership the user actually holds (defensive — the switcher UI only
   * ever offers the user's own memberships).
   *
   * Every page in the app (Browse/Dashboard/Members/Activity/... — all built
   * on TanStack Query, none of it audited here for family-scoped query keys)
   * needs its data to refetch under the new family context. Rather than try
   * to invalidate every query key blind, this does a full `window.location.
   * reload()` right after switching — simple, unconditionally correct, and a
   * family switch is not a hot-path interaction (see this agent's final
   * report for the full reasoning).
   */
  const switchFamily = useCallback(
    (familyId) => {
      const match = memberships.find((m) => m.familyId === familyId);
      if (!match) return false;
      if (familyId !== activeFamilyId) {
        persistActiveFamilyId(familyId);
        window.location.reload();
      }
      return true;
    },
    [memberships, activeFamilyId],
  );

  /**
   * POST /family — { familyName } -> creates a new Family + owner/admin
   * Membership for the caller, adds it to `memberships`, and makes it the
   * active family. Used by both `pages/Onboarding.jsx` (first-run, zero
   * memberships) and `components/layout/FamilySwitcher.jsx`'s "+ Create a
   * new family" action.
   *
   * Deliberately does NOT reload the page itself (unlike `switchFamily`) —
   * `Onboarding` calls this with zero prior memberships, so there's no stale
   * family-scoped cache to worry about; a caller switching FROM an existing
   * family (the switcher's create action) should reload itself the same way
   * `switchFamily` does, for the same cache-correctness reason.
   */
  const createFamily = useCallback(async (familyName) => {
    const { family, membership } = await familyApi.create(familyName);
    const newMembership = {
      id: membership.id,
      familyId: family.id,
      familyName: family.name,
      role: membership.role,
      access: membership.access,
      isOwner: membership.isOwner,
      status: membership.status,
    };
    setMemberships((prev) => {
      const next = [...prev, newMembership];
      storage.set(STORAGE_KEYS.memberships, next);
      return next;
    });
    persistActiveFamilyId(family.id);
    setActiveFamilyIdState(family.id);
    return newMembership;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = storage.getRaw(STORAGE_KEYS.refreshToken);
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // Server-side revoke is best-effort; always clear locally.
    }
    clearSession();
    persistActiveFamilyId(null);
    setUser(null);
    setMemberships([]);
    setActiveFamilyIdState(null);
    setFamilyDetail(null);
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await authApi.logoutAll();
    } finally {
      clearSession();
      persistActiveFamilyId(null);
      setUser(null);
      setMemberships([]);
      setActiveFamilyIdState(null);
      setFamilyDetail(null);
    }
  }, []);

  const updateUser = useCallback((next) => {
    setUser(next);
    storage.set(STORAGE_KEYS.user, next);
  }, []);

  const activeMembership = useMemo(
    () => memberships.find((m) => m.familyId === activeFamilyId) || null,
    [memberships, activeFamilyId],
  );

  const activeFamily = useMemo(() => {
    if (!activeMembership) return null;
    const base = { id: activeMembership.familyId, name: activeMembership.familyName };
    if (familyDetail && familyDetail.id === activeMembership.familyId) {
      return { ...base, ...familyDetail };
    }
    return base;
  }, [activeMembership, familyDetail]);

  const value = useMemo(
    () => ({
      user,
      memberships,
      activeFamilyId,
      activeMembership,
      activeFamily,
      // Backward-compat aliases — every page built before multi-family reads
      // these two names; keep them working unchanged.
      membership: activeMembership,
      family: activeFamily,
      isAuthenticated: user !== null,
      loading,
      login,
      signup,
      loginWithGoogle,
      completeGoogleSignup,
      acceptInvite,
      switchFamily,
      createFamily,
      logout,
      logoutAll,
      updateUser,
    }),
    [
      user,
      memberships,
      activeFamilyId,
      activeMembership,
      activeFamily,
      loading,
      login,
      signup,
      loginWithGoogle,
      completeGoogleSignup,
      acceptInvite,
      switchFamily,
      createFamily,
      logout,
      logoutAll,
      updateUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Access the current auth session: `{ user, memberships, activeFamilyId,
 * activeMembership, activeFamily, membership, family, isAuthenticated,
 * loading, login, signup, loginWithGoogle, completeGoogleSignup,
 * acceptInvite, switchFamily, createFamily, logout, logoutAll, updateUser }`.
 * Must be used under `<AuthProvider>` (mounted in main.jsx).
 *
 * `membership`/`family` are backward-compat aliases for
 * `activeMembership`/`activeFamily` — every page built before multi-family
 * accounts landed keeps working unchanged.
 *
 * @example
 * const { user, isAuthenticated, login, logout } = useAuth();
 * @example
 * const { memberships, activeFamilyId, switchFamily } = useAuth(); // FamilySwitcher
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
