/**
 * Small text helpers shared by every parser. All pure, no DOM.
 *
 * OCR lines are `{ text, confidence }` (confidence 0-100; PDF text-layer lines
 * use 100). A parser field is `{ value, confidence: 'high' | 'low' }`.
 */

// OCR look-alikes, applied ONLY inside fields that must be digits/patterns —
// never to names or addresses.
const TO_DIGIT = { O: '0', o: '0', Q: '0', D: '0', U: '0', I: '1', l: '1', i: '1', '|': '1', '!': '1', L: '1', J: '1', Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6', T: '7', g: '9', q: '9', A: '4' };
const TO_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B' };

/** Map look-alike letters to digits (O->0, I/l->1, S->5, B->8, ...). */
export function fixDigits(str) {
  return String(str || '').replace(/[OoQDUIli|!LJZzSsBGbTgqA]/g, (c) => TO_DIGIT[c] ?? c);
}

/**
 * Fix a token against a positional shape: `A` = letter, `9` = digit, `X` = either.
 * Returns the fixed uppercase string, or null if the length doesn't match.
 * e.g. fixByShape('A8CDE1Z34F', 'AAAAA9999A') -> 'ABCDE1234F'
 */
export function fixByShape(token, shape) {
  const t = String(token || '').toUpperCase();
  if (t.length !== shape.length) return null;
  let out = '';
  for (let i = 0; i < shape.length; i += 1) {
    const c = t[i];
    if (shape[i] === 'A') out += /[A-Z]/.test(c) ? c : (TO_LETTER[c] ?? c);
    else if (shape[i] === '9') out += /\d/.test(c) ? c : (TO_DIGIT[c] ?? c);
    else out += c;
  }
  return out;
}

const DEVANAGARI = /[ऀ-ॿ]/;

/** Latin part of a (possibly bilingual Hindi/English) line, trimmed. */
export function latinOnly(text) {
  return String(text || '')
    .replace(/[ऀ-ॿ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasDevanagari(text) {
  return DEVANAGARI.test(text || '');
}

/** `RAMESH  KUMAR` / `ramesh kumar` -> `Ramesh Kumar`. Mixed-case input is kept as-is. */
export function toTitleCase(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  const isAllUpper = s === s.toUpperCase();
  const isAllLower = s === s.toLowerCase();
  if (!isAllUpper && !isAllLower) return s;
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => w.replace(/(^|[-'.])([a-z])/g, (m, p, c) => p + c.toUpperCase()))
    .join(' ');
}

const NAME_STOPWORDS = /\b(government|govt|india|republic|department|income|tax|permanent|account|number|card|election|commission|identity|unique|identification|authority|driving|licen[cs]e|union|transport|male|female|transgender|dob|birth|date|year|signature|address|father|husband|mother|name|valid|issue|expiry|aadhaar|aadhar|enrolment|vid|help|www|uidai|elector|epic|sex|age|bank|branch|ifsc|passbook|holder|nominee|customer|mobile|email|photo|scan|download|issued|signed|digitally)\b/i;

/**
 * Could this line plausibly be a person's name? 2-5 words of Latin letters,
 * no digits, no document boilerplate words.
 */
export function looksLikeName(text) {
  const s = latinOnly(text).replace(/[.,:;]+$/g, '').trim();
  if (s.length < 3 || s.length > 60) return false;
  if (/\d/.test(s)) return false;
  if (!/^[A-Za-z][A-Za-z .'-]+$/.test(s)) return false;
  if (NAME_STOPWORDS.test(s)) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;
  // Single short words are usually OCR crumbs ("Mr", "Ms", "DL").
  if (words.length === 1 && s.length < 4) return false;
  // Most words should be 2+ letters.
  return words.filter((w) => w.replace(/[.'-]/g, '').length >= 2).length >= Math.ceil(words.length / 2);
}

/** Tidy a name candidate: drop Hindi, stray punctuation, leading honorific/labels. */
export function cleanName(text) {
  return toTitleCase(
    latinOnly(text)
      .replace(/^(name|nam|naam)\s*[:.\-/]*\s*/i, '')
      .replace(/^(mr|mrs|ms|shri|smt|kumari)\.?\s+/i, '')
      .replace(/[^A-Za-z .'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.'-]+|[\s.'-]+$/g, ''),
  );
}

/** Text after a `Label:` on the same line (handles `:`, `-`, `/`, `.` separators). */
export function valueAfterLabel(line, labelRe) {
  const m = String(line || '').match(labelRe);
  if (!m) return null;
  return line.slice(m.index + m[0].length).replace(/^[\s:.\-/|]+/, '').trim();
}

/** 'high' when a line was read confidently, else 'low'. */
export function lineConfidence(line, threshold = 75) {
  return (line?.confidence ?? 100) >= threshold ? 'high' : 'low';
}

/** Build a field result, or null for an empty value. */
export function field(value, confidence = 'high') {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return { value: String(value).trim(), confidence };
}

/** Accepts raw text or `[{text, confidence}]`, always returns the line array. */
export function toLines(input) {
  if (Array.isArray(input)) return input.filter((l) => l && String(l.text || '').trim());
  return String(input || '')
    .split(/\r?\n/)
    .map((text) => ({ text, confidence: 100 }))
    .filter((l) => l.text.trim());
}

export function joinText(lines) {
  return lines.map((l) => l.text).join('\n');
}

/** Drop null/empty field entries from a parser's `fields` object. */
export function compactFields(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v));
}
