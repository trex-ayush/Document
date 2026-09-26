import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext.jsx';
import { platformApi } from '@/services/platformApi.js';

/** Shared query key for `GET /platform-settings` — the nav and the Platform Settings page reuse one cache entry. */
export const PLATFORM_SETTINGS_KEY = ['platform-settings'];

/** Same query options everywhere, so the nav's lookup and the page's form never fetch twice. */
export function platformSettingsQuery(options = {}) {
  return {
    queryKey: PLATFORM_SETTINGS_KEY,
    queryFn: () => platformApi.get(),
    staleTime: 5 * 60_000,
    ...options,
  };
}

/**
 * Write a `PATCH /platform-settings` response into the cache WITHOUT losing `isPlatformOwner` /
 * `isPlatformAdmin` / `platformRole` — only `GET` includes those, so replacing the cached object
 * outright would make the "Admin" nav link vanish right after they save something.
 */
export function mergePlatformSettings(queryClient, updated) {
  queryClient.setQueryData(PLATFORM_SETTINGS_KEY, (old) => ({ ...(old || {}), ...updated }));
}

/**
 * usePlatformOwner — the signed-in person's platform role, read from `GET /platform-settings`
 * (docs/ADMIN_API.md "Existing endpoints").
 *
 * Returns `{ isPlatformOwner, isPlatformAdmin, platformRole, isKnown, isLoading }`:
 *  - `isPlatformOwner` — the super admin (`SUPER_ADMIN_EMAIL`); `true` only when the server said so.
 *  - `isPlatformAdmin` — super admin OR admin (can open `/admin`). Falls back to
 *    `isPlatformOwner` when the server doesn't send the flag yet.
 *  - `platformRole` — `'super' | 'admin' | null` (falls back to `'super'` for the owner).
 *  - `isKnown` — `true` once the server has answered with a flag either way (so a caller can tell
 *    "no access" apart from "still loading").
 * UI hint only — the server still 403s every admin/owner-only request for anyone else.
 */
export function usePlatformOwner() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading } = useQuery(platformSettingsQuery({ enabled: Boolean(isAuthenticated) }));
  const ownerFlag = data?.isPlatformOwner;
  const adminFlag = data?.isPlatformAdmin;
  const isPlatformOwner = ownerFlag === true;
  const isPlatformAdmin = typeof adminFlag === 'boolean' ? adminFlag || isPlatformOwner : isPlatformOwner;
  const serverRole = data?.platformRole;
  const platformRole =
    serverRole === 'super' || serverRole === 'admin' ? serverRole : isPlatformOwner ? 'super' : isPlatformAdmin ? 'admin' : null;
  return {
    isPlatformOwner,
    isPlatformAdmin,
    platformRole,
    isKnown: typeof ownerFlag === 'boolean' || typeof adminFlag === 'boolean',
    isLoading,
  };
}
