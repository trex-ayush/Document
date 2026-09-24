/**
 * Centralised access to Vite env variables. `VITE_API_URL` already includes the
 * `/api` prefix (see client/.env.example) — service files call `apiClient` with
 * paths like `/auth/login`, never `/api/auth/login`.
 *
 * Falls back to the local dev server instead of throwing so the app still boots
 * (with failing requests) if a .env file is missing — friendlier for a fresh
 * clone than a hard crash at module load.
 */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  /** Optional. Empty/unset hides every Google sign-in affordance (Login/Signup buttons, One Tap). */
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
};
