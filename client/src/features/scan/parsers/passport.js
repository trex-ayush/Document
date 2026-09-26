/**
 * Passport -> fields. The machine-readable zone (MRZ, the two `P<IND...` lines
 * at the bottom) is the source of truth: it carries check digits, so number,
 * DOB and expiry are verified. OCR of the printed page is used only for place
 * of issue and date of issue (not in the MRZ).
 */
import { parse as parseMrz } from 'mrz';
import { findPassportNumbers } from '../patterns.js';
import { findDates, mrzDateToIso } from '../dates.js';
import {
  toLines, joinText, latinOnly, toTitleCase, lineConfidence, field, compactFields,
} from '../textUtils.js';

/** OCR'd MRZ text -> clean `[A-Z0-9<]` string (spaces dropped, common misreads of `<` fixed). */
function cleanMrzLine(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[«‹]/g, '<<')
    .replace(/[\s]/g, '')
    .replace(/[^A-Z0-9<]/g, '<');
}

/** Filler `<` often OCRs as K/C/L runs — only rewrite runs of 3+ at line end. */
function fixTrailingFiller(s) {
  return s.replace(/[<KCL]{3,}$/, (m) => '<'.repeat(m.length));
}

function fit(s, len) {
  return s.length >= len ? s.slice(0, len) : s.padEnd(len, '<');
}

/** Finds the two TD3 lines in OCR output. Returns `{ line1, line2, conf }` or null. */
export function extractMrzLines(lines) {
  const cleaned = lines.map((l) => ({ s: cleanMrzLine(l.text), conf: l.confidence ?? 100 }));
  for (let i = 0; i < cleaned.length; i += 1) {
    const a = cleaned[i].s;
    const m = a.match(/P[<KC]?IND[A-Z<]{5,}/);
    if (!m) continue;
    let line1 = a.slice(m.index);
    line1 = line1.replace(/^P[KC]?IND/, 'P<IND');
    line1 = fit(fixTrailingFiller(line1), 44);
    // Second line: the next line that looks like `<doc number 9><check><nationality><DOB>...`
    for (let j = i + 1; j < Math.min(cleaned.length, i + 3); j += 1) {
      const b = cleaned[j].s;
      const m2 = b.match(/[A-Z0-9<]{9}[0-9OISB][A-Z<]{3}[0-9OISB]{6}[0-9OISB][MF<X][0-9OISB]{6}/);
      if (!m2) continue;
      const line2 = fit(fixTrailingFiller(b.slice(m2.index)), 44);
      return { line1, line2, conf: Math.min(cleaned[i].conf, cleaned[j].conf) };
    }
  }
  return null;
}

function detailValid(result, fieldName) {
  const d = result.details.find((x) => x.field === fieldName);
  return Boolean(d && d.valid);
}

/** Parses the MRZ; every value comes back with 'high' confidence only when its check digit passes. */
function parsePassportMrz(line1, line2, today = new Date()) {
  let result;
  try {
    result = parseMrz([line1, line2], { autocorrect: true });
  } catch {
    return null;
  }
  if (result.format !== 'TD3') return null;
  const f = result.fields;
  const out = {};
  const docOk = detailValid(result, 'documentNumberCheckDigit');
  if (f.documentNumber) out.number = field(f.documentNumber.replace(/</g, ''), docOk ? 'high' : 'low');
  const given = (f.firstName || '').trim();
  const surname = (f.lastName || '').trim();
  const name = [given, surname].filter(Boolean).join(' ');
  if (name) out.name = field(toTitleCase(name), 'high');
  const dobOk = detailValid(result, 'birthDateCheckDigit');
  const dob = mrzDateToIso(f.birthDate, 'birth', today);
  if (dob) out.dob = field(dob, dobOk ? 'high' : 'low');
  const expOk = detailValid(result, 'expirationDateCheckDigit');
  const exp = mrzDateToIso(f.expirationDate, 'expiry', today);
  if (exp) out.expiry = field(exp, expOk ? 'high' : 'low');
  if (f.sex === 'male' || f.sex === 'female') out.gender = field(f.sex === 'male' ? 'Male' : 'Female');
  return { fields: out, valid: result.valid };
}

const PLACE_OF_ISSUE = /Place\s+of\s+Issue/i;
const DATE_OF_ISSUE = /Date\s+of\s+Issue/i;
const DATE_OF_EXPIRY = /Date\s+of\s+Expiry/i;

/** @param {string | {text: string, confidence: number}[]} input */
export function parsePassport(input, today = new Date()) {
  const lines = toLines(input);
  const text = joinText(lines);
  let fields = {};

  const mrz = extractMrzLines(lines);
  if (mrz) {
    const parsed = parsePassportMrz(mrz.line1, mrz.line2, today);
    if (parsed) {
      fields = { ...parsed.fields };
      // The name isn't check-digit protected; trust it only as much as the OCR line.
      if (fields.name && mrz.conf < 75) fields.name = field(fields.name.value, 'low');
    }
  }

  if (!fields.number) {
    const n = findPassportNumbers(text.replace(/P[<K]IND.*$/gms, ''))[0];
    if (n) fields.number = field(n.value, 'low');
  }

  // Place of issue: value is on the label line after the label, or on the next line.
  const poiIdx = lines.findIndex((l) => PLACE_OF_ISSUE.test(l.text));
  if (poiIdx !== -1) {
    const same = latinOnly(lines[poiIdx].text.slice(lines[poiIdx].text.search(PLACE_OF_ISSUE))).replace(PLACE_OF_ISSUE, '').replace(/^[\s:/.-]+/, '');
    const candidate = /[A-Za-z]{3,}/.test(same) && !DATE_OF_ISSUE.test(same) ? { text: same, confidence: lines[poiIdx].confidence } : lines[poiIdx + 1];
    if (candidate) {
      const place = latinOnly(candidate.text).replace(/[^A-Za-z ,.-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (place.length >= 3 && !/date|issue|expiry/i.test(place)) fields.placeOfIssue = field(toTitleCase(place), lineConfidence(candidate, 80));
    }
  }

  // Date of issue: first date on/after the "Date of Issue" label that isn't the DOB or expiry.
  const exclude = new Set([fields.dob?.value, fields.expiry?.value].filter(Boolean));
  const doiIdx = lines.findIndex((l) => DATE_OF_ISSUE.test(l.text));
  if (doiIdx !== -1) {
    for (let j = doiIdx; j < Math.min(lines.length, doiIdx + 3); j += 1) {
      const d = findDates(lines[j].text).find((x) => !exclude.has(x.iso));
      if (d) {
        fields.issueDate = field(d.iso, lineConfidence(lines[j], 75));
        break;
      }
    }
  }

  // No MRZ expiry: fall back to the printed "Date of Expiry".
  if (!fields.expiry) {
    const doeIdx = lines.findIndex((l) => DATE_OF_EXPIRY.test(l.text));
    if (doeIdx !== -1) {
      const all = findDates(lines.slice(doeIdx, doeIdx + 2).map((l) => l.text).join(' '));
      const last = all[all.length - 1];
      if (last) fields.expiry = field(last.iso, 'low');
    }
  }

  return { kind: 'passport', fields: compactFields(fields) };
}
