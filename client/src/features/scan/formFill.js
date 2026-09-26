/**
 * Turns what the scanner read into the two things the "Add document" form can take: a title and
 * a few plain lines for Notes. Pure — unit-tested without any OCR.
 *
 * Rules:
 *  - only confident values are used ('high': checksum/pattern-validated or a clearly-read line) —
 *    a missing line is better than a wrong one, so unclear values are skipped silently;
 *  - Notes get one "Label: value" line per value, in a fixed, familiar order per kind
 *    (e.g. "Name: Ramesh Kumar\nDOB: 15/08/1985\nAadhaar No: 2345 6789 0124");
 *  - dates are written day-first (DD/MM/YYYY), the way Indian documents print them;
 *  - below those, after a blank line and a "Text read from the photo:" heading, the rest of the
 *    text that was read clearly (any document, known or not), so nothing on the paper is lost.
 */

/** English labels; the form passes translated ones (scan:noteLabels) so Hindi users get Hindi. */
const DEFAULT_NOTE_LABELS = {
  name: 'Name',
  fatherName: "Father's name",
  dob: 'DOB',
  yob: 'Year of birth',
  gender: 'Gender',
  address: 'Address',
  aadhaarNumber: 'Aadhaar No',
  panNumber: 'PAN No',
  passportNumber: 'Passport No',
  dlNumber: 'DL No',
  epicNumber: 'Voter ID No',
  issueDate: 'Issue date',
  expiry: 'Expiry date',
  validTill: 'Valid till',
  placeOfIssue: 'Place of issue',
  bank: 'Bank',
  accountHolder: 'Account holder',
  accountNumber: 'Account No',
  ifsc: 'IFSC',
};

/** Per kind: [parsed field, label key] in the order the lines are written. */
const NOTE_LINES = {
  aadhaar: [['name', 'name'], ['dob', 'dob'], ['yob', 'yob'], ['gender', 'gender'], ['address', 'address'], ['number', 'aadhaarNumber']],
  pan: [['name', 'name'], ['fatherName', 'fatherName'], ['dob', 'dob'], ['number', 'panNumber']],
  passport: [['name', 'name'], ['dob', 'dob'], ['gender', 'gender'], ['number', 'passportNumber'], ['placeOfIssue', 'placeOfIssue'], ['issueDate', 'issueDate'], ['expiry', 'expiry']],
  drivingLicence: [['name', 'name'], ['dob', 'dob'], ['number', 'dlNumber'], ['validTill', 'validTill']],
  voterId: [['name', 'name'], ['fatherName', 'fatherName'], ['gender', 'gender'], ['dob', 'dob'], ['number', 'epicNumber']],
  bank: [['bank', 'bank'], ['name', 'accountHolder'], ['accountNumber', 'accountNumber'], ['ifsc', 'ifsc']],
};

function isEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

/** `YYYY-MM-DD` -> `DD/MM/YYYY`; anything else is returned unchanged. */
export function formatNoteDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

/** OCR lines below this confidence (0–100) are left out of the "text read" block. */
const TEXT_MIN_CONFIDENCE = 60;
/** The "text read" block (without its heading) stops at a line boundary before this length. */
const TEXT_MAX_CHARS = 1500;
const DEFAULT_TEXT_HEADING = 'Text read from the photo:';

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const compact = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** True for a line worth keeping: 3+ characters, mostly letters/digits (Latin or Devanagari). */
function isReadableLine(text) {
  if (text.length < 3) return false;
  const useful = (text.match(/[\p{L}\p{N}\p{M}]/gu) || []).length;
  const visible = text.replace(/\s/g, '').length;
  return visible > 0 && useful / visible >= 0.6;
}

/**
 * The readable text of the photo/PDF as tidy lines: confident lines only, whitespace collapsed,
 * junk (1–2 characters, mostly symbols) and repeats dropped, and lines already written as
 * "Label: value" skipped. Capped at ~1500 characters.
 */
export function readableText(lines = [], { skipValues = [] } = {}) {
  const skip = skipValues.map(compact).filter((v) => v.length >= 3);
  const alreadyWritten = (key) => skip.some((v) => key === v || (v.length >= 4 && key.includes(v)));
  const seen = new Set();
  const out = [];
  let size = 0;
  for (const line of lines) {
    if ((line?.confidence ?? 100) < TEXT_MIN_CONFIDENCE) continue;
    const text = squash(line?.text);
    if (!isReadableLine(text)) continue;
    const key = compact(text);
    if (seen.has(key) || alreadyWritten(key)) continue;
    if (size + text.length + 1 > TEXT_MAX_CHARS) break;
    seen.add(key);
    out.push(text);
    size += text.length + 1;
  }
  return out;
}

/**
 * @param {object} args
 * @param {{kind: string|null, fields: object}} args.parsed  output of parseReads
 * @param {{text: string, confidence?: number}[]} [args.lines]  every line the scanner read
 * @param {string} [args.typeLabel]  e.g. "Aadhaar Card"
 * @param {Record<string, string>} [args.labels]  translated line labels (falls back to English)
 * @param {string} [args.textHeading]  translated "Text read from the photo:" heading
 * @returns {{ title: string|null, notes: string, count: number }}
 */
export function planScanFill({ parsed, lines: readLines = [], typeLabel = '', labels = {}, textHeading = DEFAULT_TEXT_HEADING }) {
  const plan = { title: null, notes: '', count: 0 };
  const kind = parsed?.kind || null;
  const values = kind
    ? Object.fromEntries(
      Object.entries(parsed.fields || {}).filter(([, v]) => v && v.confidence === 'high' && !isEmpty(v.value)),
    )
    : {};
  // A full date of birth makes a year of birth redundant.
  if (values.dob) delete values.yob;

  const lines = [];
  const used = [];
  for (const [field, labelKey] of NOTE_LINES[kind] || []) {
    const v = values[field];
    if (!v) continue;
    const label = labels[labelKey] || DEFAULT_NOTE_LABELS[labelKey];
    const value = String(v.value).trim();
    lines.push(`${label}: ${formatNoteDate(value)}`);
    used.push(value, formatNoteDate(value));
  }

  // Everything else that was read clearly goes below, so nothing on the paper is lost.
  const extra = readableText(readLines, { skipValues: used });
  const blocks = [];
  if (lines.length) blocks.push(lines.join('\n'));
  if (extra.length) blocks.push([textHeading, ...extra].join('\n'));
  plan.notes = blocks.join('\n\n');

  const name = values.name?.value;
  if (kind && (typeLabel || name)) plan.title = typeLabel && name ? `${typeLabel} – ${name}` : typeLabel || name;

  plan.count = lines.length + extra.length + (plan.title ? 1 : 0);
  return plan;
}
