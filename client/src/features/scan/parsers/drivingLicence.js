/**
 * Driving licence -> fields. Card layouts differ a lot between states (and
 * old paper/booklet licences exist), so this is deliberately lenient: anything
 * not found via a strict pattern is marked low-confidence.
 */
import { findDlNumbers } from '../patterns.js';
import { findDates, isPlausibleBirthDate } from '../dates.js';
import {
  toLines, joinText, latinOnly, looksLikeName, cleanName, lineConfidence, field, compactFields,
} from '../textUtils.js';

const DL_LABEL = /\b(DL\s*No|D\.L\.\s*No|Licen[cs]e\s*No|DLNo)\b\.?/i;
const NAME_LABEL = /^\s*(Name|Holder'?s?\s*Name)\b\s*[:.\-]?/i;
const DOB_LABEL = /\b(DOB|D\.O\.B|Date\s*of\s*Birth)\b/i;
const VALID_NT = /Valid(?:ity)?\s*\(?\s*NT\s*\)?|Non[\s-]*Transport/i;
const VALID_ANY = /Valid(?:ity)?\s*(?:Till|Upto|Up\s*to|\(?\s*(?:NT|TR)\s*\)?)?|Expiry|Expires/i;
const ISSUE_LABEL = /Issue\s*Date|Date\s*of\s*Issue|\bDOI\b/i;

function datesNear(lines, idx, span = 2) {
  return lines.slice(idx, idx + span).flatMap((l) => findDates(l.text).map((d) => ({ ...d, line: l })));
}

/** @param {string | {text: string, confidence: number}[]} input */
export function parseDrivingLicence(input, today = new Date()) {
  const lines = toLines(input);
  const text = joinText(lines);
  const fields = {};

  const numbers = findDlNumbers(text);
  if (numbers.length) {
    fields.number = field(numbers[0].value, numbers[0].confidence);
  } else {
    // Lenient fallback: whatever follows a "DL No" label.
    const idx = lines.findIndex((l) => DL_LABEL.test(l.text));
    if (idx !== -1) {
      const rest = lines[idx].text.slice(lines[idx].text.search(DL_LABEL)).replace(DL_LABEL, '').replace(/^[\s:.\-]+/, '');
      const token = (rest.match(/[A-Z0-9][A-Z0-9 /-]{6,20}[0-9]/i) || [])[0];
      if (token) fields.number = field(token.toUpperCase().replace(/\s+/g, ' ').trim(), 'low');
    }
  }

  // Name
  const nameIdx = lines.findIndex((l) => NAME_LABEL.test(latinOnly(l.text)));
  if (nameIdx !== -1) {
    const rest = latinOnly(lines[nameIdx].text).replace(NAME_LABEL, '').trim();
    const cand = rest && looksLikeName(rest) ? { text: rest, confidence: lines[nameIdx].confidence } : lines[nameIdx + 1];
    if (cand && looksLikeName(cand.text)) fields.name = field(cleanName(cand.text), lineConfidence(cand, 85) === 'high' ? 'high' : 'low');
  }

  // DOB
  const dobIdx = lines.findIndex((l) => DOB_LABEL.test(l.text));
  if (dobIdx !== -1) {
    const d = datesNear(lines, dobIdx).find((x) => isPlausibleBirthDate(x.iso, today));
    if (d) fields.dob = field(d.iso, lineConfidence(d.line, 75));
  }

  // Validity: prefer the non-transport date; else any "valid till"; else the latest future date.
  const excluded = new Set([fields.dob?.value].filter(Boolean));
  const issueIdx = lines.findIndex((l) => ISSUE_LABEL.test(l.text));
  if (issueIdx !== -1) {
    const d = datesNear(lines, issueIdx, 1)[0];
    if (d) excluded.add(d.iso);
  }
  let validTill = null;
  for (const re of [VALID_NT, VALID_ANY]) {
    const idx = lines.findIndex((l) => re.test(l.text));
    if (idx === -1) continue;
    // On the label line, the date usually follows the label.
    const labelLine = lines[idx].text;
    const afterLabel = labelLine.slice(labelLine.search(re));
    const d = findDates(afterLabel).find((x) => !excluded.has(x.iso)) || datesNear(lines, idx + 1, 1).find((x) => !excluded.has(x.iso));
    if (d) {
      validTill = field(d.iso, re === VALID_NT ? lineConfidence(lines[idx], 75) : 'low');
      break;
    }
  }
  if (!validTill) {
    const nowIso = today.toISOString().slice(0, 10);
    const future = findDates(text).filter((d) => d.iso > nowIso && !excluded.has(d.iso)).sort((a, b) => (a.iso < b.iso ? 1 : -1));
    if (future[0]) validTill = field(future[0].iso, 'low');
  }
  if (validTill) fields.validTill = validTill;

  return { kind: 'drivingLicence', fields: compactFields(fields) };
}
