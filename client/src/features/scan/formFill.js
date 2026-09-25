/**
 * Maps parsed document values onto the upload form. Pure.
 *
 * Rules:
 *  - only confident values are used ('high': checksum/pattern-validated or a
 *    clearly-read line) — an empty field is better than a wrong one;
 *  - never overwrite anything the user typed: only empty fields are planned;
 *  - custom fields are matched by key (case/punctuation-insensitive, with a
 *    few aliases) — families can edit their templates, so a value whose key
 *    no longer exists is simply skipped;
 *  - `sensitive`/`type` flags on the existing field are left untouched, so
 *    numbers stay encrypted on save.
 */

const NAME = ['Name', 'Full Name', 'Holder Name', "Holder's Name"];
const DOB = ['DOB', 'Date of Birth', 'Birth Date'];
const GENDER = ['Gender', 'Sex'];
const FATHER = ["Father's Name", 'Father Name', "Relative's Name", 'Relation Name', "Husband's Name"];

export const FIELD_KEYS = {
  aadhaar: {
    number: ['Aadhaar Number', 'Aadhar Number', 'Aadhaar No', 'Aadhaar', 'UID'],
    name: NAME,
    dob: DOB,
    yob: ['Year of Birth', 'YOB'],
    gender: GENDER,
    address: ['Address'],
  },
  pan: {
    number: ['PAN Number', 'PAN', 'PAN No'],
    name: NAME,
    fatherName: FATHER,
    dob: DOB,
  },
  passport: {
    number: ['Passport Number', 'Passport No'],
    name: NAME,
    dob: DOB,
    gender: GENDER,
    issueDate: ['Issue Date', 'Date of Issue'],
    expiry: ['Expiry Date', 'Date of Expiry', 'Valid Till', 'Valid Until'],
    placeOfIssue: ['Place of Issue'],
  },
  drivingLicence: {
    number: ['DL Number', 'Licence Number', 'License Number', 'DL No', 'Driving Licence Number'],
    name: NAME,
    dob: DOB,
    validTill: ['Valid Till', 'Validity', 'Valid Upto', 'Expiry Date'],
  },
  voterId: {
    number: ['EPIC Number', 'EPIC No', 'EPIC', 'Voter ID Number'],
    name: NAME,
    fatherName: FATHER,
    gender: GENDER,
    dob: DOB,
  },
  bank: {
    bank: ['Bank', 'Bank Name'],
    accountNumber: ['Account Number', 'Account No', 'A/c No', 'A/c Number'],
    ifsc: ['IFSC', 'IFSC Code'],
    name: ['Account Holder', 'Account Holder Name', ...NAME],
  },
};

// Which parsed value also becomes the document's own expiry date.
const DOC_EXPIRY_FIELD = { passport: 'expiry', drivingLicence: 'validTill' };
const DATE_VALUES = new Set(['dob', 'issueDate', 'expiry', 'validTill']);

export function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

/**
 * @param {object} args
 * @param {{kind: string, fields: object}} args.parsed    output of parseReads
 * @param {{key: string, type?: string, value?: string}[]} args.customFields  current form fields
 * @param {{key: string, type?: string}[]} [args.templateFields]  fields the auto-selected type will add
 * @param {{title?: string, expiryDate?: string}} args.form  current form values
 * @param {string} [args.typeLabel]  e.g. "Aadhaar Card"
 * @returns {{ fields: Record<string, string>, title: string|null, expiryDate: string|null, count: number }}
 */
export function planFill({ parsed, customFields = [], templateFields = [], form = {}, typeLabel = '' }) {
  const plan = { fields: {}, title: null, expiryDate: null, count: 0 };
  if (!parsed?.kind) return plan;
  const keyMap = FIELD_KEYS[parsed.kind] || {};
  // Confident values only.
  const values = Object.fromEntries(
    Object.entries(parsed.fields || {}).filter(([, v]) => v && v.confidence === 'high' && !isEmpty(v.value)),
  );

  // Target slots: existing fields (only if empty) + template fields not yet present.
  const slots = new Map();
  for (const f of customFields) {
    const nk = normalizeKey(f.key);
    if (nk && !slots.has(nk)) slots.set(nk, { key: f.key, type: f.type || 'text', empty: isEmpty(f.value) });
  }
  for (const f of templateFields) {
    const nk = normalizeKey(f.key);
    if (nk && !slots.has(nk)) slots.set(nk, { key: f.key, type: f.type || 'text', empty: true });
  }

  const used = new Set();
  for (const [semantic, aliases] of Object.entries(keyMap)) {
    const v = values[semantic];
    if (!v) continue;
    const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(v.value);
    for (const alias of aliases) {
      const slot = slots.get(normalizeKey(alias));
      if (!slot || used.has(slot.key)) continue;
      used.add(slot.key); // first matching slot claims it, filled or not
      if (!slot.empty) break;
      // A bare year can't go into a date field; date values only go in as full dates.
      if ((slot.type === 'date' || DATE_VALUES.has(semantic)) && !isIsoDate) break;
      plan.fields[slot.key] = v.value;
      break;
    }
  }

  const name = values.name?.value;
  if (isEmpty(form.title) && (typeLabel || name)) {
    plan.title = typeLabel && name ? `${typeLabel} – ${name}` : typeLabel || name;
  }

  const expSemantic = DOC_EXPIRY_FIELD[parsed.kind];
  if (expSemantic && values[expSemantic] && isEmpty(form.expiryDate)) {
    plan.expiryDate = values[expSemantic].value;
  }

  plan.count = Object.keys(plan.fields).length + (plan.title ? 1 : 0) + (plan.expiryDate ? 1 : 0);
  return plan;
}

/** Applies planned values to a customFields array — only into fields that are still empty. */
export function applyFieldValues(customFields, planned) {
  return customFields.map((f) => {
    const value = planned[f.key];
    return value !== undefined && isEmpty(f.value) ? { ...f, value } : f;
  });
}
