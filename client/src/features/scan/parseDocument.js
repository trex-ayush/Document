/**
 * Glue between raw per-file reads and the upload form: pick the parser for a kind,
 * merge several files (Aadhaar front + back), and fold in a Secure QR.
 * Pure — unit-tested without any OCR.
 */
import { parseAadhaar } from './parsers/aadhaar.js';
import { parsePan } from './parsers/pan.js';
import { parsePassport } from './parsers/passport.js';
import { parseDrivingLicence } from './parsers/drivingLicence.js';
import { parseVoterId } from './parsers/voterId.js';
import { parseBank } from './parsers/bank.js';
import { detectDocKind } from './detectType.js';
import { aadhaarQrToFields } from './aadhaarQr.js';
import { joinText } from './textUtils.js';

export const PARSERS = {
  aadhaar: parseAadhaar,
  pan: parsePan,
  passport: parsePassport,
  drivingLicence: parseDrivingLicence,
  voterId: parseVoterId,
  bank: parseBank,
};

/** Merge field maps: 'high' beats 'low'; otherwise the earlier value wins. QR values always win. */
export function mergeFields(...maps) {
  const out = {};
  for (const map of maps) {
    for (const [k, v] of Object.entries(map || {})) {
      if (!v) continue;
      const cur = out[k];
      if (!cur) out[k] = v;
      else if (cur.source === 'qr') continue;
      else if (v.source === 'qr' || (cur.confidence === 'low' && v.confidence === 'high')) out[k] = v;
    }
  }
  return out;
}

/**
 * @param {{ lines: {text: string, confidence: number}[], qrTexts?: string[] }[]} reads one entry per file
 * @param {{ qrRecords?: object[] }} opts
 *   qrRecords — already-decoded Aadhaar QR records (see aadhaarQr.decodeAadhaarQr).
 * @returns {{ kind: string|null, fields: object, qr: object|null }}
 */
export function parseReads(reads, { qrRecords = [] } = {}) {
  const allText = reads.map((r) => joinText(r.lines || [])).join('\n');
  const qr = qrRecords[0] || null;
  const kind = qr ? 'aadhaar' : detectDocKind(allText).kind;
  if (!kind || !PARSERS[kind]) return { kind: null, fields: {}, qr: null };

  const perFile = reads.map((r) => PARSERS[kind](r.lines || []).fields);
  let fields = mergeFields(...perFile);

  let qrInfo = null;
  if (kind === 'aadhaar' && qr) {
    const q = aadhaarQrToFields(qr);
    qrInfo = q.qr;
    fields = mergeFields(q.fields, fields);
    // The QR's last 4 digits cross-check the OCR'd number.
    if (fields.number && fields.number.source !== 'qr' && q.qr.last4 && !fields.number.value.replace(/\s/g, '').endsWith(q.qr.last4)) {
      fields.number = { ...fields.number, confidence: 'low' };
    }
    // A full DOB supersedes a year of birth.
    if (fields.dob) delete fields.yob;
  }

  return { kind, fields, qr: qrInfo };
}
