import i18n from './index.js';

/**
 * Small date/time formatting helpers keyed off the active i18n language, so
 * every place in the app that shows a date gets Hindi month names etc. for
 * free once the user switches languages, without pulling in a date library
 * (per docs/DECISIONS.md's dependency list — none was added for this).
 *
 * Digits are deliberately kept as plain Latin numerals in both languages
 * (`-u-nu-latn`) — the task brief is explicit that this app doesn't need
 * Devanagari numerals, just natural Hindi text.
 *
 * Components call these directly inside render (not memoized) — they're
 * cheap, and any component that also calls `useTranslation()` elsewhere on
 * the page already re-renders on language change, which is what keeps these
 * in sync after `LanguageSwitcher` flips the language.
 */
const LOCALE_MAP = {
  en: 'en-IN-u-nu-latn',
  hi: 'hi-IN-u-nu-latn',
};

function activeLocale() {
  const lng = (i18n.language || 'en').split('-')[0];
  return LOCALE_MAP[lng] || LOCALE_MAP.en;
}

export function formatDate(date, opts = { dateStyle: 'medium' }) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(activeLocale(), opts);
  } catch {
    return d.toLocaleDateString();
  }
}

export function formatDateTime(date, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString(activeLocale(), opts);
  } catch {
    return d.toLocaleString();
  }
}

const RELATIVE_UNITS = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

/** e.g. "2 hours ago" / "2 घंटे पहले" — used where the app already shows relative time. */
export function formatRelativeTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(activeLocale(), { numeric: 'auto' });
  if (Math.abs(diffSec) < 45) return rtf.format(0, 'second');
  for (const [unit, secs] of RELATIVE_UNITS) {
    if (Math.abs(diffSec) >= secs) {
      return rtf.format(Math.round(diffSec / secs), unit);
    }
  }
  return rtf.format(diffSec, 'second');
}
