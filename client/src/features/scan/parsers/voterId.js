/**
 * Voter ID (EPIC card) -> fields: EPIC number, elector's name, relative's
 * name, gender, DOB (newer cards) — the default template only has the EPIC
 * number, the rest fill in only if the family added matching fields.
 */
import { findEpics } from '../patterns.js';
import { findDates, isPlausibleBirthDate } from '../dates.js';
import {
  toLines, joinText, latinOnly, looksLikeName, cleanName, lineConfidence, field, compactFields,
} from '../textUtils.js';

const NAME_LABEL = /^\s*(Elector'?s?\s*Name|Name)\b\s*[:.\-]?/i;
const RELATIVE_LABEL = /^\s*(Father'?s?|Husband'?s?|Mother'?s?|Relation'?s?)\s*Name\b\s*[:.\-]?/i;
const GENDER_RE = /\b(?:Sex|Gender)\s*[:.\-/]?\s*(Male|Female|M|F)\b/i;
const DOB_LABEL = /Date\s*of\s*Birth|\bDOB\b/i;

function valueAfter(lines, idx, labelRe) {
  const rest = latinOnly(lines[idx].text).replace(labelRe, '').trim();
  const cand = rest && looksLikeName(rest) ? { text: rest, confidence: lines[idx].confidence } : lines[idx + 1];
  return cand && looksLikeName(cand.text) ? field(cleanName(cand.text), lineConfidence(cand, 80)) : null;
}

/** @param {string | {text: string, confidence: number}[]} input */
export function parseVoterId(input, today = new Date()) {
  const lines = toLines(input);
  const text = joinText(lines);
  const fields = {};

  const epics = findEpics(text);
  if (epics.length) fields.number = field(epics[0].value, epics[0].confidence);

  const nameIdx = lines.findIndex((l) => NAME_LABEL.test(latinOnly(l.text)) && !RELATIVE_LABEL.test(latinOnly(l.text)));
  if (nameIdx !== -1) fields.name = valueAfter(lines, nameIdx, NAME_LABEL);
  const relIdx = lines.findIndex((l) => RELATIVE_LABEL.test(latinOnly(l.text)));
  if (relIdx !== -1) fields.fatherName = valueAfter(lines, relIdx, RELATIVE_LABEL);

  const g = text.match(GENDER_RE);
  if (g) fields.gender = field(/^f/i.test(g[1]) ? 'Female' : 'Male');

  const dobIdx = lines.findIndex((l) => DOB_LABEL.test(l.text));
  if (dobIdx !== -1) {
    const d = lines.slice(dobIdx, dobIdx + 2).flatMap((l) => findDates(l.text).map((x) => ({ ...x, l })))
      .find((x) => isPlausibleBirthDate(x.iso, today));
    if (d) fields.dob = field(d.iso, lineConfidence(d.l, 75));
  }

  return { kind: 'voterId', fields: compactFields(fields) };
}
