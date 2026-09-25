import { describe, it, expect } from 'vitest';
import { planFill, applyFieldValues, normalizeKey } from '../formFill.js';
import { parseReads, mergeFields } from '../parseDocument.js';

// Same shapes as server/src/seed/defaultDocumentTypes.js.
const AADHAAR_TEMPLATE = [
  { key: 'Aadhaar Number', type: 'text', sensitive: true },
  { key: 'Name', type: 'text', sensitive: false },
  { key: 'DOB', type: 'date', sensitive: false },
  { key: 'Address', type: 'text', sensitive: false },
];
const PASSPORT_TEMPLATE = [
  { key: 'Passport Number', type: 'text', sensitive: true },
  { key: 'Issue Date', type: 'date', sensitive: false },
  { key: 'Expiry Date', type: 'date', sensitive: false },
  { key: 'Place of Issue', type: 'text', sensitive: false },
];

const hi = (value) => ({ value, confidence: 'high' });
const lo = (value) => ({ value, confidence: 'low' });

describe('planFill', () => {
  const parsed = {
    kind: 'aadhaar',
    fields: { number: hi('2345 6789 0124'), name: hi('Ramesh Kumar'), dob: hi('1985-08-15'), address: lo('House No 12, Lucknow'), gender: hi('Male') },
  };

  it('fills confident values into template fields and builds the title', () => {
    const plan = planFill({
      parsed,
      templateFields: AADHAAR_TEMPLATE,
      form: { title: '', expiryDate: '' },
      typeLabel: 'Aadhaar Card',
    });
    expect(plan.fields).toEqual({
      'Aadhaar Number': '2345 6789 0124',
      Name: 'Ramesh Kumar',
      DOB: '1985-08-15',
    });
    expect(plan.title).toBe('Aadhaar Card – Ramesh Kumar');
    expect(plan.expiryDate).toBe(null);
    expect(plan.count).toBe(4);
  });

  it('leaves unclear (low-confidence) values empty', () => {
    const plan = planFill({ parsed, templateFields: AADHAAR_TEMPLATE, typeLabel: 'Aadhaar Card' });
    expect(plan.fields.Address).toBeUndefined();
    const shaky = planFill({ parsed: { kind: 'aadhaar', fields: { name: lo('Rarnesh') } }, templateFields: AADHAAR_TEMPLATE, typeLabel: 'Aadhaar Card' });
    expect(shaky.fields).toEqual({});
    expect(shaky.title).toBe('Aadhaar Card');
  });

  it('never plans over something the user typed', () => {
    const plan = planFill({
      parsed,
      customFields: [
        { key: 'Aadhaar Number', type: 'text', sensitive: true, value: '' },
        { key: 'Name', type: 'text', sensitive: false, value: 'Ramu' },
      ],
      form: { title: 'My card', expiryDate: '2030-01-01' },
      typeLabel: 'Aadhaar Card',
    });
    expect(plan.fields).toEqual({ 'Aadhaar Number': '2345 6789 0124' });
    expect(plan.title).toBe(null);
  });

  it('skips values whose field was removed from an edited template', () => {
    const plan = planFill({ parsed, templateFields: [{ key: 'aadhaar number', type: 'text' }], typeLabel: 'Aadhaar' });
    expect(Object.keys(plan.fields)).toEqual(['aadhaar number']);
  });

  it('does not put a bare year into a date field', () => {
    const plan = planFill({ parsed: { kind: 'aadhaar', fields: { yob: hi('1990') } }, templateFields: [{ key: 'DOB', type: 'date' }, { key: 'Year of Birth', type: 'text' }] });
    expect(plan.fields).toEqual({ 'Year of Birth': '1990' });
  });

  it("fills the document's own expiry for a passport", () => {
    const plan = planFill({
      parsed: { kind: 'passport', fields: { number: hi('Z1234567'), expiry: hi('2033-07-14'), issueDate: lo('2023-07-15'), placeOfIssue: hi('Lucknow'), name: hi('Anita Devi Sharma') } },
      templateFields: PASSPORT_TEMPLATE,
      form: {},
      typeLabel: 'Passport',
    });
    expect(plan.expiryDate).toBe('2033-07-14');
    expect(plan.fields).toEqual({ 'Passport Number': 'Z1234567', 'Expiry Date': '2033-07-14', 'Place of Issue': 'Lucknow' });
    expect(plan.title).toBe('Passport – Anita Devi Sharma');
  });

  it('returns an empty plan when nothing was recognised', () => {
    expect(planFill({ parsed: { kind: null, fields: {} } }).count).toBe(0);
  });
});

describe('applyFieldValues', () => {
  it('fills only still-empty fields and keeps sensitive flags', () => {
    const next = applyFieldValues(
      [
        { key: 'Aadhaar Number', type: 'text', sensitive: true, value: '' },
        { key: 'Name', type: 'text', sensitive: false, value: 'typed meanwhile' },
      ],
      { 'Aadhaar Number': '2345 6789 0124', Name: 'Ramesh Kumar' },
    );
    expect(next).toEqual([
      { key: 'Aadhaar Number', type: 'text', sensitive: true, value: '2345 6789 0124' },
      { key: 'Name', type: 'text', sensitive: false, value: 'typed meanwhile' },
    ]);
  });
});

describe('parseReads', () => {
  it('merges Aadhaar front and back photos', () => {
    const front = { lines: [{ text: 'GOVERNMENT OF INDIA', confidence: 90 }, { text: 'Ramesh Kumar', confidence: 90 }, { text: 'DOB: 15/08/1985', confidence: 90 }, { text: 'MALE', confidence: 90 }, { text: '2345 6789 0124', confidence: 90 }] };
    const back = { lines: [{ text: 'Unique Identification Authority of India', confidence: 90 }, { text: 'Address: House No 12, MG Road,', confidence: 90 }, { text: 'Lucknow, Uttar Pradesh - 226010', confidence: 90 }, { text: '2345 6789 0124', confidence: 90 }] };
    const r = parseReads([front, back]);
    expect(r.kind).toBe('aadhaar');
    expect(r.fields.name.value).toBe('Ramesh Kumar');
    expect(r.fields.address.value).toBe('House No 12, MG Road, Lucknow, Uttar Pradesh - 226010');
    expect(r.fields.number.value).toBe('2345 6789 0124');
  });

  it('lets a Secure QR override OCR, and cross-checks the last 4 digits', () => {
    const ocr = { lines: [{ text: 'Aadhaar', confidence: 90 }, { text: 'Rarnesh Kurnar', confidence: 60 }, { text: 'DOB: 15/08/1985', confidence: 90 }, { text: '9876 5432 1096', confidence: 90 }] };
    const qr = { source: 'secure', version: 'V2', last4: '0124', name: 'Ramesh Kumar', dob: '1985-08-15', yob: null, gender: 'Male', address: 'Lucknow - 226010' };
    const r = parseReads([ocr], { qrRecords: [qr] });
    expect(r.fields.name).toEqual({ value: 'Ramesh Kumar', confidence: 'high', source: 'qr' });
    expect(r.fields.number).toEqual({ value: '9876 5432 1096', confidence: 'low' });
    expect(r.qr.version).toBe('V2');
  });

  it("parses as the user's chosen kind even if detection disagrees", () => {
    const r = parseReads([{ lines: [{ text: 'ABCPK1234F', confidence: 95 }] }], { forcedKind: 'pan' });
    expect(r.kind).toBe('pan');
    expect(r.fields.number.value).toBe('ABCPK1234F');
  });

  it('reports nothing for an unrecognised document', () => {
    expect(parseReads([{ lines: [{ text: 'Grocery list: milk, eggs', confidence: 90 }] }]).kind).toBe(null);
  });

  it('mergeFields prefers high over low confidence and QR over everything', () => {
    expect(mergeFields({ a: lo('1') }, { a: hi('2') }).a.value).toBe('2');
    expect(mergeFields({ a: hi('1') }, { a: hi('2') }).a.value).toBe('1');
    expect(mergeFields({ a: { value: 'q', confidence: 'high', source: 'qr' } }, { a: hi('2') }).a.value).toBe('q');
  });

  it('normalises field keys', () => {
    expect(normalizeKey("Father's Name")).toBe('fathersname');
  });
});
