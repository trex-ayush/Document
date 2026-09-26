/**
 * Splits a document's Notes into lines the detail page can show one by one, each with its own
 * copy button. Pure — unit-tested.
 *
 *  - "Label: value" (what the scanner writes, e.g. "Aadhaar No: 2345 6789 0124") → a field, so the
 *    copy button copies only the value;
 *  - a line ending in ":" with nothing after it (e.g. "Text read from the photo:") → a heading;
 *  - anything else → plain text;
 *  - blank lines are dropped.
 */

/** A label is short, has a letter in it, and isn't the start of a link ("https://…"). */
const FIELD_RE = /^([^:]{1,40}):\s*(.*)$/;
const LABEL_MAX_WORDS = 5;

/** @returns {{ type: 'field', label: string, value: string } | { type: 'heading' | 'text', value: string }} */
function parseLine(line) {
  const m = FIELD_RE.exec(line);
  if (m) {
    const label = m[1].trim();
    const value = m[2].trim();
    const looksLikeLabel = /\p{L}/u.test(label) && label.split(/\s+/).length <= LABEL_MAX_WORDS && !value.startsWith('//');
    if (looksLikeLabel) {
      if (!value) return { type: 'heading', value: label };
      return { type: 'field', label, value };
    }
  }
  return { type: 'text', value: line };
}

/** @param {string} notes */
export function parseNoteLines(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseLine);
}

/**
 * What a line's copy button puts on the clipboard: a number written in groups
 * ("2345 6789 0124") is copied without the spaces, since many forms only take the digits and cut
 * off the rest; everything else is copied as shown.
 */
export function copyValue(value) {
  const s = String(value ?? '');
  return /^[\d\s]+$/.test(s) && /\d/.test(s) ? s.replace(/\s/g, '') : s;
}
