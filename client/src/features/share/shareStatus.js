/**
 * Share status/time-remaining helpers, shared by the Shares management page
 * and the per-target share list a document/folder page might embed later.
 * No `status` field comes back from `GET /shares` (docs/API.md) — it's
 * derived client-side from `revokedAt`/`expiresAt`, same logic the server
 * uses for the `status` query param.
 */

/** `expiresIn` codes accepted by POST /shares and PATCH /shares/:id's `extendTo` (docs/API.md). */
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

export function formatExpiry(share) {
  if (!share.expiresAt) return 'Never';
  return new Date(share.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Short "time remaining" string for a list row, e.g. "3h left" / "Never expires" / "Expired" / "Revoked". */
export function formatTimeRemaining(share) {
  if (share.revokedAt) return 'Revoked';
  if (!share.expiresAt) return 'Never expires';
  const diffMs = new Date(share.expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m left`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h left`;
  const days = Math.round(hours / 24);
  return `${days}d left`;
}
