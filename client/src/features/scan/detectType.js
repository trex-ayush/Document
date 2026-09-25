/**
 * Document-type detection from OCR/PDF text.
 */
import { findAadhaarNumbers, findPans, findEpics, findIfscs, findDlNumbers } from './patterns.js';
import { DOC_KINDS } from './typeKinds.js';

export { DOC_KINDS, kindFromTypeName, findTypeForKind } from './typeKinds.js';

const RULES = {
  aadhaar: [
    [/aadhaa?r|आधार/i, 3],
    [/unique\s+identification\s+authority|uidai|विशिष्ट\s*पहचान/i, 3],
    [/government\s+of\s+india|भारत\s+सरकार/i, 1],
    [/\bVID\b/, 1],
    [/enrolment\s+no/i, 2],
  ],
  pan: [
    [/income\s*tax\s+department|आयकर\s*विभाग/i, 4],
    [/permanent\s+account\s+number|स्थायी\s*लेखा\s*संख्या/i, 4],
  ],
  passport: [
    [/republic\s+of\s+india|भारत\s+गणराज्य/i, 3],
    [/passport|पासपोर्ट/i, 2],
    [/P[<K]IND/, 5],
  ],
  drivingLicence: [
    [/driving\s+licen[cs]e|ड्राइविंग\s*लाइसेंस/i, 4],
    [/union\s+of\s+india/i, 1],
    [/transport\s+department|motor\s+vehicles?/i, 1],
    [/validity\s*\((?:nt|tr)\)|\bCOV\b|class\s+of\s+vehicle/i, 2],
  ],
  voterId: [
    [/election\s+commission|निर्वाचन\s*आयोग|चुनाव\s*आयोग/i, 4],
    [/elector|मतदाता/i, 2],
    [/identity\s+card/i, 1],
  ],
  bank: [
    [/passbook|cheque|savings\s+(?:bank\s+)?a\/?c|current\s+a\/?c|account\s+holder/i, 2],
    [/\bbank\b|बैंक/i, 1],
    [/\bIFS\s*C(?:ode)?\b|\bIFSC\b/i, 1],
    [/\bA\/?C\s*No/i, 1],
  ],
};

/**
 * Scores every kind against `text` and returns `{ kind, score, scores }`.
 * `kind` is null unless the best score is at least 3 (one strong keyword or
 * a validated identifier) and strictly beats the runner-up.
 */
export function detectDocKind(text) {
  const src = String(text || '');
  const scores = {};
  for (const kind of DOC_KINDS) {
    scores[kind] = RULES[kind].reduce((sum, [re, w]) => (re.test(src) ? sum + w : sum), 0);
  }
  if (findAadhaarNumbers(src).length) scores.aadhaar += 3;
  if (findPans(src).length) scores.pan += 3;
  if (findDlNumbers(src).length) scores.drivingLicence += 3;
  if (findEpics(src).length) scores.voterId += 2;
  if (findIfscs(src).length) scores.bank += 3;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestKind, best] = ranked[0];
  const runnerUp = ranked[1][1];
  const kind = best >= 3 && best > runnerUp ? bestKind : null;
  return { kind, score: best, scores };
}
