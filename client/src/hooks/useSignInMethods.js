import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '@/services/platformApi.js';
import { PLATFORM_SETTINGS_KEY } from '@/hooks/usePlatformOwner.js';
import { env } from '@/config/env.js';

/**
 * Own cache entry under the shared `['platform-settings']` prefix (so invalidating that prefix
 * refreshes this too). NOT the exact shared key on purpose: a logged-out `GET /platform-settings`
 * has no `isPlatformOwner`, and writing it into the shared entry (5 min staleTime) would hide the
 * owner's "Platform admin" nav link for minutes after they sign in. The shared entry is only
 * read, as a head start, when it already exists.
 */
const SIGN_IN_METHODS_KEY = [...PLATFORM_SETTINGS_KEY, 'sign-in'];

const METHODS = ['google', 'password', 'both'];

/** Never hold the auth pages on a skeleton longer than this — the server may be waking up. */
const MAX_WAIT_MS = 3000;

/** True when the server refused a sign-in because the app's sign-in policy doesn't allow that method. */
export const isLoginMethodNotAllowed = (err) => err?.response?.data?.code === 'LOGIN_METHOD_NOT_ALLOWED';

/**
 * useSignInMethods — which sign-in methods the auth pages should offer, from the platform's
 * public `GET /platform-settings` (`allowedLoginMethods: 'google' | 'password' | 'both'`).
 *
 * Returns:
 * - `method` — the policy; `'both'` while unknown or if the request fails, so the page is never empty.
 * - `showGoogle` — policy allows Google AND this build has a Google client id.
 * - `showPassword` — policy allows email + password.
 * - `googleUnavailable` — policy is Google-only but this build has no Google client id.
 * - `isResolving` — no answer yet and under ~3s since mount: show a skeleton, not the wrong form.
 * - `refetch` — call after a `LOGIN_METHOD_NOT_ALLOWED` error (policy changed while the page was open).
 */
export function useSignInMethods() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: SIGN_IN_METHODS_KEY,
    queryFn: () => platformApi.get(),
    initialData: () => queryClient.getQueryData(PLATFORM_SETTINGS_KEY),
    initialDataUpdatedAt: () => queryClient.getQueryState(PLATFORM_SETTINGS_KEY)?.dataUpdatedAt,
    staleTime: 30_000,
    retry: 1,
  });

  const [waitedEnough, setWaitedEnough] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setWaitedEnough(true), MAX_WAIT_MS);
    return () => clearTimeout(id);
  }, []);

  const raw = query.data?.allowedLoginMethods;
  const known = METHODS.includes(raw);
  const method = known ? raw : 'both';
  const googleConfigured = Boolean(env.googleClientId);

  return {
    method,
    showGoogle: method !== 'password' && googleConfigured,
    showPassword: method !== 'google',
    googleUnavailable: method === 'google' && !googleConfigured,
    isResolving: !known && query.isPending && !waitedEnough,
    refetch: query.refetch,
  };
}
