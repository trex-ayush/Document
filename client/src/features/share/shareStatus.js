import { formatDateTime } from '@/i18n/formatters.js';

/**
 * Share status/time-remaining helpers, shared by the Shares management page
 * and the per-target share list a document/folder page might embed later.
 * No `status` field comes back from `GET /shares` (docs/API.md) — it's
 * derived client-side from `revokedAt`/`expiresAt`, same logic the server
 * uses for the `status` query param.
 *
 * `formatExpiry`/`formatTimeRemaining` are plain helpers (not components),
 * so they can't call `useTranslation()` themselves — callers (which already
 * have `t` from their own `useTranslation(['shares', 'common'])`) pass it
 * in. `t('common:...')` works from a `shares`-scoped `t` because every
 * namespace is preloaded (see i18n/index.js), not just the hook's own ns.
 */

/** `expiresIn` codes accepted by POST /shares and PATCH /shares/:id's `extendTo` (docs/API.md). English fallback labels — translate at the call site with `t(\`expiryOptions.${opt.value}\`, opt.label)`. */
export const EXPIRY_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'never', label: 'Never' },
];

/** includeSensitive:true caps expiry to this set (server hard invariant, docs/API.md POST /shares). */
export const SENSITIVE_ALLOWED_EXPIRY = new Set(['1h', '2h', '24h']);

/** @returns {'active'|'expired'|'revoked'} */
export function shareStatusOf(share) {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

/** @param {Function} t - from useTranslation(['shares', 'common']) (or any ns — namespaces are prefixed explicitly here) */
export function formatExpiry(share, t) {
  if (!share.expiresAt) return t('shares:expiryOptions.never', 'Never');
  return formatDateTime(share.expiresAt);
}

/** Short "time remaining" string for a list row, e.g. "3h left" / "Never expires" / "Expired" / "Revoked". */
export function formatTimeRemaining(share, t) {
  if (share.revokedAt) return t('common:status.revoked', 'Revoked');
  if (!share.expiresAt) return t('shares:timeRemaining.neverExpires', 'Never expires');
  const diffMs = new Date(share.expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return t('common:status.expired', 'Expired');
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return t('shares:timeRemaining.minutesLeft', '{{count}}m left', { count: Math.max(mins, 1) });
  const hours = Math.round(mins / 60);
  if (hours < 48) return t('shares:timeRemaining.hoursLeft', '{{count}}h left', { count: hours });
  const days = Math.round(hours / 24);
  return t('shares:timeRemaining.daysLeft', '{{count}}d left', { count: days });
}
