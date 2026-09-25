/**
 * Date normalisation. The upload form (native `<input type="date">` for the
 * document's expiry, and `type: 'date'` custom fields) expects `YYYY-MM-DD`.
 * Indian documents print dates day-first: 15/08/1985, 15-08-1985, 15.08.1985,
 * 15 AUG 1985, 15-Aug-1985.
 */
import { fixDigits } from './textUtils.js';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n) {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` if the parts form a real calendar date (1900-2099), else null. */
export function toIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Numeric: day first. Separators / - . and OCR's occasional space around them.
// Digits are OCR-fixed before matching (O->0 etc.), so this runs on fixed text.
// (No regex lookbehind: older iOS Safari can't parse it.) Group 1 is the
// non-digit boundary before the date, so the date itself starts at index + m[1].length.
const NUMERIC_DATE = /(^|\D)(\d{1,2})\s?[/\-.]\s?(\d{1,2})\s?[/\-.]\s?(\d{4})(?!\d)/g;
const ISO_DATE = /(^|\D)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const TEXT_DATE = /(^|\D)(\d{1,2})[\s\-/.]*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?[\s\-/.,]*(\d{4})(?!\d)/gi;

/**
 * Pre-fix OCR look-alikes but only inside date-shaped runs, so words like
 * "DOB" or "Sex" are never touched.
 */
function fixDateLikeRuns(text) {
  return String(text || '').replace(/[0-9OoIlSB|]{1,2}\s?[/\-.]\s?[0-9OoIlSB|]{1,2}\s?[/\-.]\s?[0-9OoIlSB|]{4}/g, (m) => fixDigits(m));
}

/**
 * Every date found in `text`, in order of appearance: `[{ iso, index }]`.
 */
export function findDates(text) {
  const src = fixDateLikeRuns(text);
  const found = [];
  let m;
  ISO_DATE.lastIndex = 0;
  while ((m = ISO_DATE.exec(src))) {
    const iso = toIsoDate(m[2], m[3], m[4]);
    if (iso) found.push({ iso, index: m.index + m[1].length });
  }
  NUMERIC_DATE.lastIndex = 0;
  while ((m = NUMERIC_DATE.exec(src))) {
    const iso = toIsoDate(m[4], m[3], m[2]);
    if (iso) found.push({ iso, index: m.index + m[1].length });
  }
  TEXT_DATE.lastIndex = 0;
  while ((m = TEXT_DATE.exec(src))) {
    const month = MONTHS[m[3].toLowerCase().slice(0, 4)] || MONTHS[m[3].toLowerCase().slice(0, 3)];
    const iso = toIsoDate(m[4], month, m[2]);
    if (iso) found.push({ iso, index: m.index + m[1].length });
  }
  return found
    .sort((a, b) => a.index - b.index)
    .filter((d, i, arr) => i === 0 || d.index !== arr[i - 1].index);
}

/** First date in `text` as `YYYY-MM-DD`, or null. */
export function normalizeDate(text) {
  return findDates(text)[0]?.iso ?? null;
}

/**
 * MRZ `YYMMDD` -> `YYYY-MM-DD`. Birth dates resolve to the past (a "30" birth
 * year is 1930 if 2030 hasn't happened yet); expiry dates always resolve to 20YY.
 */
export function mrzDateToIso(yymmdd, kind = 'birth', today = new Date()) {
  const s = String(yymmdd || '');
  if (!/^\d{6}$/.test(s)) return null;
  const yy = Number(s.slice(0, 2));
  const mm = s.slice(2, 4);
  const dd = s.slice(4, 6);
  let year;
  if (kind === 'expiry') {
    year = 2000 + yy;
  } else {
    const current = today.getUTCFullYear() % 100;
    year = yy > current ? 1900 + yy : 2000 + yy;
  }
  return toIsoDate(year, mm, dd);
}

/** A plausible birth date: in the past and not more than 120 years ago. */
export function isPlausibleBirthDate(iso, today = new Date()) {
  if (!iso) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  const age = (today - d) / (365.25 * 24 * 3600 * 1000);
  return age > 0 && age < 120;
}
