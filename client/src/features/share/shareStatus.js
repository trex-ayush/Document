import { formatDateTime } from '@/i18n/formatters.js';

/**
 * Share helpers shared by the share dialog and the Shares page.
 *
 * Link durations: a family picks a default (Settings > Family, `GET /family`
 * `defaultShareDuration`), and the sharer can pick another option per link
 * (`POST /shares` `duration`). No `status` field comes back from `GET /shares` — it's derived
 * here from `revokedAt`/`expiresAt`, the same logic the server uses.
 *
 * These are plain helpers (not components), so callers pass their own `t`; keys are namespaced
 * explicitly so any `useTranslation` t works.
 */

export const SHARE_DURATIONS = ['12h', '24h', '7d'];
const DEFAULT_SHARE_DURATION = '12h';

const DURATION_FALLBACK = { '12h': '12 hours', '24h': '1 day', '7d': '7 days' };

/** "12 hours" / "1 day" / "7 days" in the reader's language. */
export function durationLabel(value, t) {
  const fallback = DURATION_FALLBACK[value] || value;
  return t ? t(`shares:durations.${value}`, fallback) : fallback;
}

/** The family's default link duration from a `GET /family` response (falls back to 12 hours). */
export function familyShareDuration(family) {
  const value = family?.defaultShareDuration ?? family?.settings?.defaultShareDuration;
  return SHARE_DURATIONS.includes(value) ? value : DEFAULT_SHARE_DURATION;
}

/** @returns {'active'|'expired'|'revoked'} */
export function shareStatusOf(share) {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

/** Full expiry date/time, e.g. for a tooltip or the public page. */
export function formatExpiry(share) {
  return share?.expiresAt ? formatDateTime(share.expiresAt) : '';
}

/** Short "time remaining" string for a list row, e.g. "3 hours left" / "Expired" / "Turned off". */
export function formatTimeRemaining(share, t) {
  if (share.revokedAt) return t('shares:status.revoked', 'Turned off');
  if (!share.expiresAt) return '';
  const diffMs = new Date(share.expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return t('shares:status.expired', 'Expired');
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return t('shares:timeRemaining.minutesLeft', '{{count}} min left', { count: Math.max(mins, 1) });
  const hours = Math.round(mins / 60);
  if (hours < 48) {
    return hours === 1
      ? t('shares:timeRemaining.hoursLeft_one', '{{count}} hour left', { count: hours })
      : t('shares:timeRemaining.hoursLeft_other', '{{count}} hours left', { count: hours });
  }
  const days = Math.round(hours / 24);
  return t('shares:timeRemaining.daysLeft', '{{count}} days left', { count: days });
}
