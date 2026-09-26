/**
 * Aadhaar QR code decoding.
 *
 * 1) Secure QR (2019+, UIDAI "Secure QR Code Specification", March 2019):
 *    the QR text is a big base-10 integer. BigInt -> big-endian bytes ->
 *    gzip-decompress -> fields separated by byte 255, read as ISO-8859-1:
 *      [V2+ only: version "V2"/"V3"/..., ]
 *      email_mobile_indicator (0-3), referenceId (last 4 Aadhaar digits +
 *      DDMMYYYYHHMMSSsss timestamp), name, dob (DD-MM-YYYY), gender (M/F/T),
 *      care of, district, landmark, house, location, pin code, post office,
 *      state, street, sub district, VTC
 *      [V2+ only: last 4 digits of mobile]
 *    then a JPEG2000 photo (no delimiter — ignored here), optional 32-byte
 *    email/mobile hashes (V1 only) and a 256-byte RSA signature at the very end.
 *    Field order verified against the specification's own sample data.
 *    The signature is NOT verified here (that needs UIDAI's public certificate).
 *
 * 2) Old QR (pre-2018): plain XML `<PrintLetterBarcodeData uid=".." name=".." .../>`.
 *
 * The Secure QR carries only the last 4 digits of the Aadhaar number, so the
 * full number still has to come from OCR (checksum-validated).
 */
import { isValidAadhaarNumber, formatAadhaarNumber } from './verhoeff.js';
import { toIsoDate, normalizeDate } from './dates.js';
import { toTitleCase } from './textUtils.js';

const SECURE_FIELDS = [
  'emailMobileIndicator', 'referenceId', 'name', 'dob', 'gender', 'careOf', 'district', 'landmark',
  'house', 'location', 'pincode', 'postOffice', 'state', 'street', 'subDistrict', 'vtc',
];

/** Decimal string -> big-endian bytes (minimal length, no leading zero bytes). */
export function decimalToBytes(decimal) {
  let hex = BigInt(decimal).toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** gzip-decompress with the platform's DecompressionStream (browsers + Node 18+). */
async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function latin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Splits the first `count` 255-delimited fields off the front of `bytes`. */
function splitFields(bytes, count) {
  const out = [];
  let start = 0;
  for (let i = 0; i < bytes.length && out.length < count; i += 1) {
    if (bytes[i] === 255) {
      out.push(latin1(bytes.subarray(start, i)).trim());
      start = i + 1;
    }
  }
  return out;
}

function genderWord(g) {
  const s = String(g || '').trim().toUpperCase();
  if (s === 'M' || s === 'MALE') return 'Male';
  if (s === 'F' || s === 'FEMALE') return 'Female';
  if (s === 'T' || s === 'TRANSGENDER') return 'Transgender';
  return null;
}

/** Joins address parts in printed order, skipping blanks and repeats (VTC often == post office). */
export function composeAddress(parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const v = String(p || '').replace(/\s+/g, ' ').trim();
    if (!v || v === '-' || v === '.') continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.join(', ');
}

/** DD-MM-YYYY / DD/MM/YYYY / YYYY -> `{ dob }` or `{ yob }`. */
function parseQrDob(value) {
  const v = String(value || '').trim();
  if (/^\d{4}$/.test(v)) return { yob: v };
  const m = v.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) return { dob: toIsoDate(m[3], m[2], m[1]) };
  const iso = normalizeDate(v);
  return iso ? { dob: iso } : {};
}

/** Parse decompressed Secure QR bytes (sync). Returns null if it doesn't look like one. */
export function parseSecureQrBytes(bytes) {
  const first = splitFields(bytes, 1)[0] || '';
  const versioned = /^V\d+$/.test(first);
  const fieldsWanted = SECURE_FIELDS.length + (versioned ? 1 : 0);
  const raw = splitFields(bytes, fieldsWanted);
  if (raw.length < fieldsWanted) return null;
  const values = versioned ? raw.slice(1) : raw;
  const rec = Object.fromEntries(SECURE_FIELDS.map((k, i) => [k, values[i]]));
  if (!/^[0-3]$/.test(rec.emailMobileIndicator) || !/^\d{4}/.test(rec.referenceId || '')) return null;

  const { dob, yob } = parseQrDob(rec.dob);
  const address = composeAddress([
    rec.house, rec.street, rec.landmark, rec.location, rec.vtc, rec.postOffice, rec.subDistrict, rec.district, rec.state,
  ]);
  return {
    source: 'secure',
    version: versioned ? first : 'V1',
    last4: rec.referenceId.slice(0, 4),
    name: toTitleCase(rec.name) || null,
    dob: dob || null,
    yob: yob || null,
    gender: genderWord(rec.gender),
    careOf: rec.careOf || null,
    address: address ? (rec.pincode ? `${address} - ${rec.pincode}` : address) : null,
    pincode: rec.pincode || null,
  };
}

function xmlAttr(xml, name) {
  const m = xml.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  if (!m) return '';
  return m[2].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

/** Old (pre-2018) `PrintLetterBarcodeData` XML QR. Returns null if it isn't one. */
export function parseXmlQr(text) {
  const xml = String(text || '');
  if (!/<\s*PrintLetterBarcodeData\b/i.test(xml)) return null;
  const uid = xmlAttr(xml, 'uid').replace(/\s+/g, '');
  const { dob, yob: yobFromDob } = parseQrDob(xmlAttr(xml, 'dob'));
  const yob = xmlAttr(xml, 'yob') || yobFromDob || null;
  const pc = xmlAttr(xml, 'pc');
  const address = composeAddress([
    xmlAttr(xml, 'house'), xmlAttr(xml, 'street'), xmlAttr(xml, 'lm'), xmlAttr(xml, 'loc'), xmlAttr(xml, 'vtc'),
    xmlAttr(xml, 'po'), xmlAttr(xml, 'subdist'), xmlAttr(xml, 'dist'), xmlAttr(xml, 'state'),
  ]);
  return {
    source: 'xml',
    version: 'XML',
    // Old QRs carry the full number; later ones mask it ("xxxxxxxx1234").
    number: isValidAadhaarNumber(uid) ? formatAadhaarNumber(uid) : null,
    last4: /\d{4}$/.test(uid) ? uid.slice(-4) : null,
    name: toTitleCase(xmlAttr(xml, 'name')) || null,
    dob: dob || null,
    yob: dob ? null : yob,
    gender: genderWord(xmlAttr(xml, 'gender')),
    careOf: xmlAttr(xml, 'co') || null,
    address: address ? (pc ? `${address} - ${pc}` : address) : null,
    pincode: pc || null,
  };
}

/**
 * Any Aadhaar QR payload (decoded QR text) -> normalised record, or null if
 * the text isn't an Aadhaar QR.
 */
export async function decodeAadhaarQr(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const xml = parseXmlQr(t);
  if (xml) return xml;
  // Secure QRs are thousands of decimal digits long.
  if (!/^\d{200,}$/.test(t)) return null;
  try {
    const bytes = await gunzip(decimalToBytes(t));
    return parseSecureQrBytes(bytes);
  } catch {
    return null;
  }
}

/** Aadhaar QR record -> parser-style `{ kind, fields }` (all values trusted: 'high'). */
export function aadhaarQrToFields(rec) {
  const f = {};
  const put = (k, v) => { if (v) f[k] = { value: String(v), confidence: 'high', source: 'qr' }; };
  put('number', rec.number);
  put('name', rec.name);
  put('dob', rec.dob);
  put('yob', rec.yob);
  put('gender', rec.gender);
  put('address', rec.address);
  return { kind: 'aadhaar', fields: f, qr: { source: rec.source, version: rec.version, last4: rec.last4 } };
}
