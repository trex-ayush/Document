/**
 * Turns what the scanner read into the two things the "Add document" form can take: a title and
 * a few plain lines for Notes. Pure — unit-tested without any OCR.
 *
 * Rules:
 *  - only confident values are used ('high': checksum/pattern-validated or a clearly-read line) —
 *    a missing line is better than a wrong one, so unclear values are skipped silently;
 *  - Notes get one "Label: value" line per value, in a fixed, familiar order per kind
 *    (e.g. "Name: Ramesh Kumar\nDOB: 15/08/1985\nAadhaar No: 2345 6789 0124");
 *  - dates are written day-first (DD/MM/YYYY), the way Indian documents print them.
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

/**
 * @param {object} args
 * @param {{kind: string|null, fields: object}} args.parsed  output of parseReads
 * @param {string} [args.typeLabel]  e.g. "Aadhaar Card"
 * @param {Record<string, string>} [args.labels]  translated line labels (falls back to English)
 * @returns {{ title: string|null, notes: string, count: number }}
 */
export function planScanFill({ parsed, typeLabel = '', labels = {} }) {
  const plan = { title: null, notes: '', count: 0 };
  if (!parsed?.kind) return plan;
  const values = Object.fromEntries(
    Object.entries(parsed.fields || {}).filter(([, v]) => v && v.confidence === 'high' && !isEmpty(v.value)),
  );
  // A full date of birth makes a year of birth redundant.
  if (values.dob) delete values.yob;

  const lines = [];
  for (const [field, labelKey] of NOTE_LINES[parsed.kind] || []) {
    const v = values[field];
    if (!v) continue;
    const label = labels[labelKey] || DEFAULT_NOTE_LABELS[labelKey];
    lines.push(`${label}: ${formatNoteDate(String(v.value).trim())}`);
  }
  plan.notes = lines.join('\n');

  const name = values.name?.value;
  if (typeLabel || name) plan.title = typeLabel && name ? `${typeLabel} – ${name}` : typeLabel || name;

  plan.count = lines.length + (plan.title ? 1 : 0);
  return plan;
}
