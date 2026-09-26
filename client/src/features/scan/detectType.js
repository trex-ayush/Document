/**
 * Document-type detection from OCR/PDF text.
 *
 * Every kind gets a score from its keywords and validated identifiers; a kind is only named when
 * its score is at least MIN_SCORE AND beats every other kind by at least MIN_MARGIN. Anything
 * less (a chat or SMS screenshot, a bill, a blurry photo) comes out as `null`: the form keeps the
 * file name as the title and just copies the readable text into Notes. Calling a random
 * screenshot a "PAN Card" is worse than not naming it at all.
 */
import { findAadhaarNumbers, findPans, findEpics, findIfscs, findDlNumbers } from './patterns.js';

/** Every kind of document the scanner has a parser for. */
const DOC_KINDS = ['aadhaar', 'pan', 'passport', 'drivingLicence', 'voterId', 'bank'];

/**
 * The confidence threshold. 4 = more than one clue: a strong keyword plus a validated number,
 * or two strong keywords, or a keyword with the card's DOB/gender lines. A single keyword (3)
 * or a single number-shaped match (3) is not enough, since chat and SMS text produces those.
 */
const MIN_SCORE = 4;
/** The winner must lead the runner-up by this much, so a close call names nothing. */
const MIN_MARGIN = 2;

const PAN_KEYWORD = /income\s*tax\s+department|permanent\s+account\s+number|आयकर\s*विभाग|स्थायी\s*लेखा\s*संख्या/i;
/** 4th PAN letter = holder type (P person, C company, H HUF, F firm, A AOP, T trust, B BOI, L local authority, J juridical person, G govt). */
const PAN_HOLDER_TYPE = /^[A-Z]{3}[PCHFATBLJG]/;
const AADHAAR_KEYWORD = /aadhaa?r|आधार|unique\s+identification\s+authority|uidai|विशिष्ट\s*पहचान/i;
const DOB_LINE = /\b(DOB|D0B|Date\s*of\s*Birth|Year\s*of\s*Birth)\b|जन्म\s*तिथि|जन्मतिथि|जन्म\s*वर्ष/i;
const GENDER_LINE = /\b(MALE|FEMALE|TRANSGENDER)\b|पुरुष|महिला/i;

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
 * Scores every kind against `text` and returns `{ kind, score, scores }` (`kind` null when no
 * kind is clearly ahead — see MIN_SCORE and MIN_MARGIN).
 */
export function detectDocKind(text) {
  const src = String(text || '');
  const scores = {};
  for (const kind of DOC_KINDS) {
    scores[kind] = RULES[kind].reduce((sum, [re, w]) => (re.test(src) ? sum + w : sum), 0);
  }

  // Aadhaar: a checksum-valid number (a misread one fails the checksum), plus the DOB and
  // gender lines of the front side when the card also names itself.
  const aadhaarNumbers = findAadhaarNumbers(src);
  if (aadhaarNumbers.length) scores.aadhaar += aadhaarNumbers.some((n) => n.confidence === 'high') ? 3 : 2;
  if (aadhaarNumbers.length || AADHAAR_KEYWORD.test(src) || /government\s+of\s+india|भारत\s+सरकार/i.test(src)) {
    const dob = DOB_LINE.test(src);
    const gender = GENDER_LINE.test(src);
    if (dob) scores.aadhaar += 1;
    if (gender) scores.aadhaar += 1;
    // Name / DOB / gender together is the Aadhaar front layout ("Government of India" on top).
    if (dob && gender) scores.aadhaar += 1;
  }

  // PAN: only with BOTH a PAN keyword and a PAN-shaped number with a real holder-type letter.
  // Capitals and digits in chat text often form a PAN-shaped word, so the number alone, or the
  // keyword alone, never counts.
  const pans = findPans(src).filter((p) => PAN_HOLDER_TYPE.test(p.value));
  scores.pan = PAN_KEYWORD.test(src) && pans.length ? scores.pan + 3 : 0;

  if (findDlNumbers(src).length) scores.drivingLicence += 3;
  if (findEpics(src).length) scores.voterId += 2;
  if (findIfscs(src).length) scores.bank += 3;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestKind, best] = ranked[0];
  const runnerUp = ranked[1][1];
  const kind = best >= MIN_SCORE && best - runnerUp >= MIN_MARGIN ? bestKind : null;
  return { kind, score: best, scores };
}
