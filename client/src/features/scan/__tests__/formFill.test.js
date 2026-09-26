import { describe, it, expect } from 'vitest';
import { planScanFill, formatNoteDate, readableText } from '../formFill.js';
import { parseReads, mergeFields } from '../parseDocument.js';

const hi = (value) => ({ value, confidence: 'high' });
const lo = (value) => ({ value, confidence: 'low' });

describe('planScanFill', () => {
  const parsed = {
    kind: 'aadhaar',
    fields: { number: hi('2345 6789 0124'), name: hi('Ramesh Kumar'), dob: hi('1985-08-15'), address: hi('House No 12, Lucknow'), gender: lo('Male') },
  };

  it('builds the title and writes confident values into Notes as simple lines', () => {
    const plan = planScanFill({ parsed, typeLabel: 'Aadhaar Card' });
    expect(plan.title).toBe('Aadhaar Card – Ramesh Kumar');
    expect(plan.notes).toBe('Name: Ramesh Kumar\nDOB: 15/08/1985\nAddress: House No 12, Lucknow\nAadhaar No: 2345 6789 0124');
    expect(plan.count).toBe(5);
  });

  it('skips unclear (low-confidence) values silently', () => {
    const plan = planScanFill({ parsed, typeLabel: 'Aadhaar Card' });
    expect(plan.notes).not.toMatch(/Gender/);
    const shaky = planScanFill({ parsed: { kind: 'aadhaar', fields: { name: lo('Rarnesh') } }, typeLabel: 'Aadhaar Card' });
    expect(shaky.notes).toBe('');
    expect(shaky.title).toBe('Aadhaar Card');
  });

  it('uses translated labels when given, English otherwise', () => {
    const plan = planScanFill({ parsed, typeLabel: 'आधार कार्ड', labels: { name: 'नाम', aadhaarNumber: 'आधार नंबर' } });
    expect(plan.notes.split('\n')).toEqual(['नाम: Ramesh Kumar', 'DOB: 15/08/1985', 'Address: House No 12, Lucknow', 'आधार नंबर: 2345 6789 0124']);
  });

  it('keeps a year of birth only when there is no full date of birth', () => {
    expect(planScanFill({ parsed: { kind: 'aadhaar', fields: { yob: hi('1990') } } }).notes).toBe('Year of birth: 1990');
    expect(planScanFill({ parsed: { kind: 'aadhaar', fields: { yob: hi('1990'), dob: hi('1990-02-03') } } }).notes).toBe('DOB: 03/02/1990');
  });

  it('writes passport dates day-first', () => {
    const plan = planScanFill({
      parsed: { kind: 'passport', fields: { number: hi('Z1234567'), expiry: hi('2033-07-14'), issueDate: lo('2023-07-15'), placeOfIssue: hi('Lucknow'), name: hi('Anita Devi Sharma') } },
      typeLabel: 'Passport',
    });
    expect(plan.notes).toBe('Name: Anita Devi Sharma\nPassport No: Z1234567\nPlace of issue: Lucknow\nExpiry date: 14/07/2033');
    expect(plan.title).toBe('Passport – Anita Devi Sharma');
  });

  it('labels a bank name as the account holder', () => {
    const plan = planScanFill({ parsed: { kind: 'bank', fields: { bank: hi('State Bank of India'), name: hi('Ramesh Kumar'), ifsc: hi('SBIN0001234'), accountNumber: lo('1234') } }, typeLabel: 'Bank Account' });
    expect(plan.notes).toBe('Bank: State Bank of India\nAccount holder: Ramesh Kumar\nIFSC: SBIN0001234');
  });

  it('returns an empty plan when nothing was recognised', () => {
    const plan = planScanFill({ parsed: { kind: null, fields: {} } });
    expect(plan).toEqual({ title: null, notes: '', count: 0 });
  });

  it('formats ISO dates day-first and leaves other text alone', () => {
    expect(formatNoteDate('1970-01-01')).toBe('01/01/1970');
    expect(formatNoteDate('1990')).toBe('1990');
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

  it('reports nothing for an unrecognised document', () => {
    expect(parseReads([{ lines: [{ text: 'Grocery list: milk, eggs', confidence: 90 }] }]).kind).toBe(null);
  });

  it('mergeFields prefers high over low confidence and QR over everything', () => {
    expect(mergeFields({ a: lo('1') }, { a: hi('2') }).a.value).toBe('2');
    expect(mergeFields({ a: hi('1') }, { a: hi('2') }).a.value).toBe('1');
    expect(mergeFields({ a: { value: 'q', confidence: 'high', source: 'qr' } }, { a: hi('2') }).a.value).toBe('q');
  });
});

describe('text read from the photo', () => {
  const line = (text, confidence = 90) => ({ text, confidence });

  it('fills Notes with the readable text of an unknown document, under a heading', () => {
    const lines = [line('City Hospital - Discharge Summary'), line('Patient:   Sunita   Singh'), line('Follow up after two weeks')];
    const plan = planScanFill({ parsed: { kind: null, fields: {} }, lines });
    expect(plan.title).toBe(null);
    expect(plan.notes).toBe('Text read from the photo:\nCity Hospital - Discharge Summary\nPatient: Sunita Singh\nFollow up after two weeks');
  });

  it('keeps only confident, readable lines: no junk, symbols or repeats', () => {
    const lines = [line('Invoice 2291'), line('Ab'), line('~~~ |// ;;'), line('blurry words', 20), line('Invoice   2291'), line('कुल राशि 500')];
    expect(readableText(lines)).toEqual(['Invoice 2291', 'कुल राशि 500']);
  });

  it('caps the text at about 1500 characters on a line boundary', () => {
    const lines = Array.from({ length: 100 }, (_, i) => line(`Line number ${i} with some words on it`));
    const kept = readableText(lines);
    expect(kept.join('\n').length).toBeLessThanOrEqual(1500);
    expect(kept.length).toBeGreaterThan(10);
    expect(kept.at(-1)).toMatch(/^Line number \d+ with some words on it$/);
  });

  it('puts the known fields first, then a blank line and the other text, without repeating them', () => {
    const parsed = { kind: 'aadhaar', fields: { name: hi('Ramesh Kumar'), dob: hi('1985-08-15'), number: hi('2345 6789 0124') } };
    const lines = [line('Government of India'), line('Ramesh Kumar'), line('DOB: 15/08/1985'), line('2345 6789 0124'), line('Mera Aadhaar, Meri Pehchaan')];
    const plan = planScanFill({ parsed, lines, typeLabel: 'Aadhaar Card', textHeading: 'फ़ोटो से पढ़ा गया टेक्स्ट:' });
    expect(plan.notes).toBe(
      'Name: Ramesh Kumar\nDOB: 15/08/1985\nAadhaar No: 2345 6789 0124\n\nफ़ोटो से पढ़ा गया टेक्स्ट:\nGovernment of India\nMera Aadhaar, Meri Pehchaan',
    );
    expect(plan.title).toBe('Aadhaar Card – Ramesh Kumar');
  });

  it('leaves Notes empty when nothing was read clearly', () => {
    expect(planScanFill({ parsed: { kind: null, fields: {} }, lines: [line('x'), line('smudge', 10)] }).notes).toBe('');
  });
});
