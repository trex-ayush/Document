import { describe, it, expect } from 'vitest';
import {
  decodeAadhaarQr, parseXmlQr, parseSecureQrBytes, decimalToBytes, composeAddress, aadhaarQrToFields,
} from '../aadhaarQr.js';

// Synthetic Secure QR payloads built exactly the way UIDAI's specification
// describes (fields split by byte 255, then photo, [hashes], 256-byte signature,
// gzip, big-endian bytes -> base-10). All personal data is invented.

const enc = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToDecimal(bytes) {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt(`0x${hex}`).toString(10);
}

function buildPayload(fields, { hashes = 0 } = {}) {
  const parts = [];
  for (const f of fields) {
    parts.push(...enc(f), 255);
  }
  // Fake "JPEG2000 photo" — deliberately contains 255 bytes to prove we don't split inside it.
  const photo = [0xff, 0x4f, 0xff, 0x51, 1, 2, 3, 255, 255, 9];
  const hashBytes = new Array(32 * hashes).fill(0xab);
  const signature = new Array(256).fill(0x5a);
  return Uint8Array.from([...parts, ...photo, ...hashBytes, ...signature]);
}

const V1_FIELDS = [
  '3', // email + mobile present
  '0124' + '25092026101530123', // last 4 of Aadhaar + DDMMYYYYHHMMSSsss
  'Ramesh Kumar',
  '15-08-1985',
  'M',
  'S/O: Suresh Kumar',
  'Lucknow',
  'Near Shiv Mandir',
  'House No 12',
  'Gomti Nagar',
  '226010',
  'Gomti Nagar',
  'Uttar Pradesh',
  'MG Road',
  'Lucknow',
  'Gomti Nagar',
];

describe('Aadhaar Secure QR (V1, no version field)', () => {
  it('decodes name, DOB, gender and a composed address', async () => {
    const decimal = bytesToDecimal(await gzip(buildPayload(V1_FIELDS, { hashes: 2 })));
    expect(decimal.length).toBeGreaterThan(200);
    const rec = await decodeAadhaarQr(decimal);
    expect(rec).toMatchObject({
      source: 'secure',
      version: 'V1',
      last4: '0124',
      name: 'Ramesh Kumar',
      dob: '1985-08-15',
      gender: 'Male',
      careOf: 'S/O: Suresh Kumar',
      pincode: '226010',
    });
    expect(rec.address).toBe('House No 12, MG Road, Near Shiv Mandir, Gomti Nagar, Lucknow, Uttar Pradesh - 226010');
  });
});

describe('Aadhaar Secure QR (V2, version field first, mobile last-4 after VTC)', () => {
  it('shifts the fields by one and ignores the trailing mobile digits', async () => {
    const fields = ['V2', ...V1_FIELDS.slice(0, 2), 'ANITA DEVI', '1990', 'F', ...V1_FIELDS.slice(5), '3210'];
    fields[1] = '2';
    const rec = await decodeAadhaarQr(bytesToDecimal(await gzip(buildPayload(fields))));
    expect(rec.version).toBe('V2');
    expect(rec.name).toBe('Anita Devi');
    expect(rec.dob).toBe(null);
    expect(rec.yob).toBe('1990');
    expect(rec.gender).toBe('Female');
    expect(rec.last4).toBe('0124');
  });

  it('maps to trusted parser fields (no full number — only the last 4 are in the QR)', async () => {
    const rec = await decodeAadhaarQr(bytesToDecimal(await gzip(buildPayload(['V2', ...V1_FIELDS, '3210']))));
    const { fields, qr } = aadhaarQrToFields(rec);
    expect(fields.number).toBeUndefined();
    expect(fields.name).toEqual({ value: 'Ramesh Kumar', confidence: 'high', source: 'qr' });
    expect(fields.dob.value).toBe('1985-08-15');
    expect(qr).toEqual({ source: 'secure', version: 'V2', last4: '0124' });
  });
});

describe('Aadhaar QR edge cases', () => {
  it('returns null for text that is not an Aadhaar QR', async () => {
    expect(await decodeAadhaarQr('https://example.com')).toBe(null);
    expect(await decodeAadhaarQr('123456')).toBe(null);
    expect(await decodeAadhaarQr('9'.repeat(400))).toBe(null); // not gzip
    expect(await decodeAadhaarQr('')).toBe(null);
  });

  it('rejects decompressed data with too few fields', () => {
    expect(parseSecureQrBytes(Uint8Array.from([...enc('3'), 255, ...enc('0124')]))).toBe(null);
  });

  it('converts big decimals to minimal big-endian bytes', () => {
    expect([...decimalToBytes('65535')]).toEqual([255, 255]);
    expect([...decimalToBytes('256')]).toEqual([1, 0]);
  });

  it('composes addresses without blanks or repeats', () => {
    expect(composeAddress(['12', '', 'Main Road', 'Rampur', 'rampur', '-', 'Bihar'])).toBe('12, Main Road, Rampur, Bihar');
  });
});

describe('old XML Aadhaar QR (PrintLetterBarcodeData)', () => {
  const XML = `<?xml version="1.0" encoding="UTF-8"?>
<PrintLetterBarcodeData uid="234567890124" name="Ramesh Kumar" gender="M" yob="1985" co="S/O Suresh Kumar"
 house="House No 12" street="MG Road" lm="Near Shiv Mandir" loc="Gomti Nagar" vtc="Lucknow" po="Gomti Nagar"
 dist="Lucknow" subdist="Lucknow" state="Uttar Pradesh" pc="226010" dob="15/08/1985"/>`;

  it('reads every attribute including the full, checksum-valid number', async () => {
    const rec = await decodeAadhaarQr(XML);
    expect(rec).toMatchObject({
      source: 'xml',
      number: '2345 6789 0124',
      last4: '0124',
      name: 'Ramesh Kumar',
      dob: '1985-08-15',
      yob: null,
      gender: 'Male',
      pincode: '226010',
    });
    expect(rec.address).toBe('House No 12, MG Road, Near Shiv Mandir, Gomti Nagar, Lucknow, Uttar Pradesh - 226010');
  });

  it('keeps only the year when there is no full DOB, and drops a masked or invalid uid', () => {
    const rec = parseXmlQr('<PrintLetterBarcodeData uid="xxxxxxxx0124" name="ANITA DEVI" gender="F" yob="1990" pc="110001" state="Delhi"/>');
    expect(rec.number).toBe(null);
    expect(rec.last4).toBe('0124');
    expect(rec.name).toBe('Anita Devi');
    expect(rec.yob).toBe('1990');
    expect(rec.dob).toBe(null);
    expect(parseXmlQr('<PrintLetterBarcodeData uid="234567890125" name="X Y"/>').number).toBe(null);
  });
});
