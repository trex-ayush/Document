/**
 * Aadhaar card (front and/or back, or e-Aadhaar PDF text) -> fields.
 *
 * Front: name (English line above the DOB line), DOB or year of birth, gender,
 * 12-digit number. Back: "Address:" block, number again.
 */
import { findAadhaarNumbers } from '../patterns.js';
import { findDates, isPlausibleBirthDate } from '../dates.js';
import {
  toLines, joinText, latinOnly, looksLikeName, cleanName, lineConfidence, field, hasDevanagari, fixDigits, compactFields,
} from '../textUtils.js';

const DOB_LABEL = /(DOB|D0B|DO8|Date\s*of\s*Birth|जन्म\s*तिथि|जन्मतिथि)/i;
const YOB_LABEL = /(Year\s*of\s*Birth|YoB|जन्म\s*वर्ष)/i;
const GENDER_RE = /\b(MALE|FEMALE|TRANSGENDER)\b|पुरुष|महिला|ट्रांसजेंडर/i;
const ADDRESS_LABEL = /\b(Address|Addres|Adress)\b\s*[:;.]?/i;
const ADDRESS_STOP = /(uidai|help@|www\.|1947|\bVID\b|aadhaar|आधार|unique\s+identification|P\.?\s*O\.?\s*Box\s*1947|Bengaluru-560\s*001)/i;
const HEADER_RE = /(government|govt|india|uidai|unique|authority|aadhaar|enrolment|issue\s*date|download\s*date)/i;

function parseGender(text) {
  const m = String(text).match(GENDER_RE);
  if (!m) return null;
  const s = m[0].toLowerCase();
  if (s.startsWith('fem') || s === 'महिला') return 'Female';
  if (s.startsWith('trans') || s === 'ट्रांसजेंडर') return 'Transgender';
  return 'Male';
}

/** Strip a leading "S/O: X," / "C/O X," care-of segment, tidy spacing and commas. */
function cleanAddress(text) {
  return String(text || '')
    .replace(/^\s*(?:[SDWC]\s*\/\s*O|Care\s+of)\s*[:.]?\s*[^,]*,\s*/i, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(,\s*){2,}/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}

function findAddress(lines) {
  const idx = lines.findIndex((l) => ADDRESS_LABEL.test(latinOnly(l.text)));
  if (idx === -1) return null;
  const parts = [];
  const confs = [];
  const first = latinOnly(lines[idx].text);
  const afterLabel = first.slice(first.search(ADDRESS_LABEL)).replace(ADDRESS_LABEL, '').trim();
  if (afterLabel) {
    parts.push(afterLabel);
    confs.push(lines[idx].confidence ?? 100);
  }
  for (let i = idx + 1; i < lines.length && parts.length < 8; i += 1) {
    const raw = lines[i].text;
    if (ADDRESS_STOP.test(raw)) break;
    if (findAadhaarNumbers(raw).length) break;
    // Bilingual cards print the Hindi address first/alongside; keep English only.
    if (hasDevanagari(raw) && latinOnly(raw).length < 4) continue;
    const latin = latinOnly(raw);
    if (!latin) continue;
    parts.push(latin);
    confs.push(lines[i].confidence ?? 100);
    // The PIN code closes the address block.
    if (/\b\d{6}\b/.test(fixDigits(latin.replace(/[A-Za-z]{3,}/g, ' ')))) break;
  }
  const address = cleanAddress(parts.join(', '));
  if (address.length < 8) return null;
  const minConf = Math.min(...confs);
  return field(address, minConf >= 80 ? 'high' : 'low');
}

/** @param {string | {text: string, confidence: number}[]} input */
export function parseAadhaar(input) {
  const lines = toLines(input);
  const text = joinText(lines);
  const fields = {};

  const numbers = findAadhaarNumbers(text);
  if (numbers.length) fields.number = field(numbers[0].value, numbers[0].confidence);

  // DOB / year of birth
  let dobLineIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (DOB_LABEL.test(lines[i].text)) {
      const dates = findDates(lines[i].text).filter((d) => isPlausibleBirthDate(d.iso));
      const fromNext = !dates.length && lines[i + 1] ? findDates(lines[i + 1].text).filter((d) => isPlausibleBirthDate(d.iso)) : [];
      const d = dates[0] || fromNext[0];
      if (d) {
        fields.dob = field(d.iso, lineConfidence(lines[i], 70));
        dobLineIdx = i;
        break;
      }
    }
    if (YOB_LABEL.test(lines[i].text)) {
      const m = fixDigits(lines[i].text.replace(YOB_LABEL, ' ')).match(/\b(19\d{2}|20\d{2})\b/);
      if (m) {
        fields.yob = field(m[1], lineConfidence(lines[i], 70));
        dobLineIdx = i;
        break;
      }
    }
  }

  const gender = parseGender(text);
  if (gender) fields.gender = field(gender);

  // Name: nearest English name-looking line above the DOB line (front side).
  if (dobLineIdx > 0) {
    for (let i = dobLineIdx - 1; i >= Math.max(0, dobLineIdx - 4); i -= 1) {
      const line = lines[i];
      if (HEADER_RE.test(line.text)) break;
      if (looksLikeName(line.text)) {
        fields.name = field(cleanName(line.text), lineConfidence(line, 80));
        break;
      }
    }
  }
  // e-Aadhaar letters / text layers sometimes label it.
  if (!fields.name) {
    const labelled = lines.findIndex((l) => /^\s*(Name|नाम)\s*[:/]/i.test(l.text));
    if (labelled !== -1) {
      const rest = latinOnly(lines[labelled].text.replace(/^\s*(Name|नाम)\s*[:/]\s*/i, ''));
      const cand = rest && looksLikeName(rest) ? { text: rest, confidence: lines[labelled].confidence } : lines[labelled + 1];
      if (cand && looksLikeName(cand.text)) fields.name = field(cleanName(cand.text), lineConfidence(cand, 80));
    }
  }

  const address = findAddress(lines);
  if (address) fields.address = address;

  return { kind: 'aadhaar', fields: compactFields(fields) };
}
