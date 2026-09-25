/**
 * Identifier patterns for Indian documents, with OCR look-alike repair applied
 * only inside the candidate token (see textUtils.fixByShape).
 */
import { fixByShape, fixDigits } from './textUtils.js';
import { isValidAadhaarNumber, formatAadhaarNumber } from './verhoeff.js';

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const EPIC_RE = /^[A-Z]{3}[0-9]{7}$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// 4th PAN character = holder type. P = person, C = company, H = HUF, F = firm,
// A = AOP, T = trust, B = BOI, L = local authority, J = artificial juridical person, G = govt.
const PAN_HOLDER_TYPES = /[PCHFATBLJG]/;

/**
 * Tokens of `len` alphanumeric chars, also trying to glue split tokens
 * (`ABCDE 1234F`). Returns `[{ tok, glued }]`, unglued first.
 */
function candidateTokens(text, len) {
  const out = new Map();
  const upper = String(text || '').toUpperCase();
  const words = upper.split(/[^A-Z0-9|]+/).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    if (words[i].length === len) out.set(words[i], false);
  }
  for (let i = 0; i < words.length; i += 1) {
    let glued = words[i];
    for (let j = i + 1; j < Math.min(words.length, i + 3) && glued.length < len; j += 1) {
      glued += words[j];
      if (glued.length === len && !out.has(glued)) out.set(glued, true);
    }
  }
  return [...out].map(([tok, glued]) => ({ tok, glued }));
}

/** All PANs in `text`: `[{ value, confidence }]`. */
export function findPans(text) {
  const results = [];
  for (const { tok } of candidateTokens(text, 10)) {
    // Only repair tokens that already look mostly right (>= 7 chars in the right class).
    let matches = 0;
    for (let i = 0; i < 10; i += 1) {
      const isLetter = /[A-Z]/.test(tok[i]);
      if ((i < 5 || i === 9) === isLetter) matches += 1;
    }
    if (matches < 7) continue;
    const fixed = fixByShape(tok, 'AAAAA9999A');
    if (fixed && PAN_RE.test(fixed)) {
      const confidence = fixed === tok && PAN_HOLDER_TYPES.test(fixed[3]) ? 'high' : 'low';
      if (!results.some((r) => r.value === fixed)) results.push({ value: fixed, confidence });
    }
  }
  return results.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1));
}

/** All voter-ID EPIC numbers (`ABC1234567`) in `text`. */
export function findEpics(text) {
  const results = [];
  for (const { tok } of candidateTokens(text, 10)) {
    let matches = 0;
    for (let i = 0; i < 10; i += 1) {
      const isLetter = /[A-Z]/.test(tok[i]);
      if ((i < 3) === isLetter) matches += 1;
    }
    if (matches < 8) continue;
    const fixed = fixByShape(tok, 'AAA9999999');
    if (fixed && EPIC_RE.test(fixed) && !results.some((r) => r.value === fixed)) {
      results.push({ value: fixed, confidence: fixed === tok ? 'high' : 'low' });
    }
  }
  return results;
}

/** All IFSC codes in `text`. The 5th char is always zero (OCR often reads it as O). */
export function findIfscs(text) {
  const results = [];
  for (const { tok, glued } of candidateTokens(text, 11)) {
    if (!/^[A-Z0-9]{4}[0O][A-Z0-9]{6}$/.test(tok)) continue;
    // "BANK OF INDIA" glues to BANKOFINDIA — a real branch code almost always has a digit.
    if ((glued || tok[4] === 'O') && !/\d/.test(tok.slice(5))) continue;
    const fixed = fixByShape(tok.slice(0, 5), 'AAAA9') + tok.slice(5);
    if (IFSC_RE.test(fixed) && !results.some((r) => r.value === fixed)) {
      results.push({ value: fixed, confidence: fixed === tok ? 'high' : 'low' });
    }
  }
  return results;
}

/**
 * All checksum-valid Aadhaar numbers in `text` (`XXXX XXXX XXXX`). Excludes
 * digits that are part of a longer run (e.g. a 16-digit VID). A candidate that
 * fails Verhoeff is rejected outright — never "fixed" into something else.
 */
export function findAadhaarNumbers(text) {
  const src = String(text || '');
  const results = [];
  // 4-4-4 groups of digit look-alikes, or a single 12-char run.
  const re = /(^|[^0-9A-Za-z])([0-9OoIlSB|]{4})[ \t-]?([0-9OoIlSB|]{4})[ \t-]?([0-9OoIlSB|]{4})(?![0-9A-Za-z])/g;
  let m;
  while ((m = re.exec(src))) {
    // Reject when directly preceded by another digit group (part of a 16-digit VID).
    const before = src.slice(0, m.index + m[1].length);
    if (/\d{4}[ \t-]?$/.test(before)) continue;
    // ...or directly followed by one (the first 12 digits of a VID).
    const after = src.slice(m.index + m[0].length);
    if (/^[ \t-]?\d{4}(?!\d)/.test(after)) continue;
    const raw = m[2] + m[3] + m[4];
    const digitsInRaw = (raw.match(/\d/g) || []).length;
    if (digitsInRaw < 10) continue; // mostly letters — it's a word, not a number
    const digits = fixDigits(raw);
    if (isValidAadhaarNumber(digits)) {
      const value = formatAadhaarNumber(digits);
      if (!results.some((r) => r.value === value)) {
        results.push({ value, confidence: digits === raw ? 'high' : 'low' });
      }
    }
  }
  return results;
}

/**
 * Indian driving-licence numbers: state code (2 letters) + RTO (2 digits) +
 * year of issue (4 digits) + serial (7 digits), with optional space/hyphen
 * separators (`MH12 20110012345`, `DL-0420110149646`, `KA-01-2020-0001234`).
 * Returned normalised as `SS00 YYYYNNNNNNN`.
 */
export function findDlNumbers(text) {
  const results = [];
  const upper = String(text || '').toUpperCase();
  const re = /(^|[^A-Z0-9])([A-Z0-9]{2})[\s-]{0,2}([0-9OISBL|]{2})[\s-]{0,2}([0-9OISBL|]{4})[\s-]{0,2}([0-9OISBL|]{7})(?![A-Z0-9])/g;
  let m;
  while ((m = re.exec(upper))) {
    const state = fixByShape(m[2], 'AA');
    const rto = fixDigits(m[3]);
    const year = fixDigits(m[4]);
    const serial = fixDigits(m[5]);
    if (!/^[A-Z]{2}$/.test(state) || !/^\d{2}$/.test(rto) || !/^\d{7}$/.test(serial)) continue;
    const y = Number(year);
    if (!(y >= 1950 && y <= 2099)) continue;
    const value = `${state}${rto} ${year}${serial}`;
    const exact = m[2] === state && m[3] === rto && m[4] === year && m[5] === serial;
    if (!results.some((r) => r.value === value)) results.push({ value, confidence: exact ? 'high' : 'low' });
  }
  return results;
}

/** Indian passport number shape (`J1234567`). Used only as a fallback when there's no MRZ. */
export function findPassportNumbers(text) {
  const results = [];
  const re = /(^|[^A-Z0-9])([A-Z])\s?([0-9OISB]{7})(?![A-Z0-9])/g;
  const upper = String(text || '').toUpperCase();
  let m;
  while ((m = re.exec(upper))) {
    const value = m[2] + fixDigits(m[3]);
    if (/^[A-Z][0-9]{7}$/.test(value) && !results.some((r) => r.value === value)) {
      results.push({ value, confidence: 'low' });
    }
  }
  return results;
}
