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
 * Write a `PATCH /platform-settings` response into the cache WITHOUT losing `isPlatformOwner` —
 * only `GET` includes that flag, so replacing the cached object outright would make the owner's
 * "Platform admin" nav link vanish right after they save something.
 */
export function mergePlatformSettings(queryClient, updated) {
  queryClient.setQueryData(PLATFORM_SETTINGS_KEY, (old) => ({ ...(old || {}), ...updated }));
}

/**
 * usePlatformOwner — is the signed-in person this deployment's platform owner
 * (`PLATFORM_OWNER_EMAIL`)? Reads `isPlatformOwner` from `GET /platform-settings`.
 *
 * Returns `{ isPlatformOwner, isKnown, isLoading }`: `isPlatformOwner` is `true` only when the
 * server said so; `isKnown` is `true` once the server has answered with the flag either way (so a
 * caller can tell "not the owner" apart from "still loading"). UI hint only — the server still
 * 403s every owner-only write for anyone else.
 */
export function usePlatformOwner() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading } = useQuery(platformSettingsQuery({ enabled: Boolean(isAuthenticated) }));
  const flag = data?.isPlatformOwner;
  return {
    isPlatformOwner: flag === true,
    isKnown: typeof flag === 'boolean',
    isLoading,
  };
}

export default usePlatformOwner;
