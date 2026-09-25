/**
 * PAN card -> fields. Handles both layouts:
 *  - new (2018+): labelled "Name", "Father's Name", "Date of Birth", PAN near the top
 *  - old: unlabelled name, father's name and DOB lines under the header, PAN
 *    under "Permanent Account Number"
 */
import { findPans } from '../patterns.js';
import { findDates, isPlausibleBirthDate } from '../dates.js';
import {
  toLines, joinText, latinOnly, looksLikeName, cleanName, lineConfidence, field, compactFields,
} from '../textUtils.js';

// Matched against the Latin part of a line: "नाम / Name" -> "/ Name".
const NAME_LABEL = /^[\s/|]*Name\b/i;
const FATHER_LABEL = /Father'?s?\s*Name|पिता\s*का\s*नाम/i;
const DOB_LABEL = /Date\s*of\s*Birth|जन्म\s*की\s*तारीख|\bDOB\b/i;
const HEADER = /income\s*tax|govt|government|permanent\s+account|department/i;

function nameAfterLabel(lines, idx, labelRe) {
  const line = lines[idx];
  const latin = latinOnly(line.text);
  const m = latin.match(labelRe);
  if (m) {
    const rest = latin.slice(m.index + m[0].length).replace(/^[\s:./-]+/, '');
    if (rest && looksLikeName(rest)) return field(cleanName(rest), lineConfidence(line, 80));
  }
  for (let j = idx + 1; j < Math.min(lines.length, idx + 3); j += 1) {
    if (looksLikeName(lines[j].text)) return field(cleanName(lines[j].text), lineConfidence(lines[j], 80));
  }
  return null;
}

/** @param {string | {text: string, confidence: number}[]} input */
export function parsePan(input) {
  const lines = toLines(input);
  const text = joinText(lines);
  const fields = {};

  const pans = findPans(text);
  if (pans.length) fields.number = field(pans[0].value, pans[0].confidence);

  const fatherIdx = lines.findIndex((l) => FATHER_LABEL.test(l.text));
  const nameIdx = lines.findIndex((l, i) => i !== fatherIdx && NAME_LABEL.test(latinOnly(l.text)) && !FATHER_LABEL.test(l.text));

  if (nameIdx !== -1) fields.name = nameAfterLabel(lines, nameIdx, /Name/i);
  if (fatherIdx !== -1) fields.fatherName = nameAfterLabel(lines, fatherIdx, /Father'?s?\s*Name/i);

  // DOB: labelled first, else the first plausible birth date anywhere.
  const dobIdx = lines.findIndex((l) => DOB_LABEL.test(l.text));
  let dob = null;
  if (dobIdx !== -1) {
    for (let j = dobIdx; j < Math.min(lines.length, dobIdx + 3) && !dob; j += 1) {
      const d = findDates(lines[j].text).find((x) => isPlausibleBirthDate(x.iso));
      if (d) dob = { iso: d.iso, line: lines[j], idx: j };
    }
  }
  if (!dob) {
    for (let j = 0; j < lines.length && !dob; j += 1) {
      const d = findDates(lines[j].text).find((x) => isPlausibleBirthDate(x.iso));
      if (d) dob = { iso: d.iso, line: lines[j], idx: j };
    }
  }
  if (dob) fields.dob = field(dob.iso, lineConfidence(dob.line, 70));

  // Old layout: no labels — the two name-looking lines between the header and the DOB.
  if (!fields.name && dob) {
    const headerIdx = lines.findIndex((l) => HEADER.test(l.text));
    const names = [];
    for (let j = Math.max(0, headerIdx + 1); j < dob.idx; j += 1) {
      if (!HEADER.test(lines[j].text) && looksLikeName(lines[j].text)) names.push(lines[j]);
    }
    if (names[0]) fields.name = field(cleanName(names[0].text), 'low');
    if (names[1] && !fields.fatherName) fields.fatherName = field(cleanName(names[1].text), 'low');
  }

  return { kind: 'pan', fields: compactFields(fields) };
}
