/**
 * Bank passbook first page / cancelled cheque / account letter -> fields:
 * IFSC, account number, bank name, account holder.
 */
import { findIfscs } from '../patterns.js';
import {
  toLines, joinText, latinOnly, looksLikeName, cleanName, lineConfidence, field, compactFields, fixDigits, toTitleCase,
} from '../textUtils.js';

// IFSC prefix -> bank. Only the large, stable ones; anything else falls back to
// a "... BANK ..." line in the text.
const IFSC_BANKS = {
  SBIN: 'State Bank of India',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  UTIB: 'Axis Bank',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  UBIN: 'Union Bank of India',
  KKBK: 'Kotak Mahindra Bank',
  IDIB: 'Indian Bank',
  BKID: 'Bank of India',
  IOBA: 'Indian Overseas Bank',
  CBIN: 'Central Bank of India',
  MAHB: 'Bank of Maharashtra',
  UCBA: 'UCO Bank',
  PSIB: 'Punjab & Sind Bank',
  YESB: 'Yes Bank',
  INDB: 'IndusInd Bank',
  IDFB: 'IDFC First Bank',
  FDRL: 'Federal Bank',
  IBKL: 'IDBI Bank',
  AIRP: 'Airtel Payments Bank',
  IPOS: 'India Post Payments Bank',
};

const ACCOUNT_LABEL = /(A\s*\/\s*C|Account|Acct|SB\s*A\/?c|Khata)\s*(No|Number|Num)?\.?\s*[:.\-]?/i;
const HOLDER_LABEL = /^\s*(Name|Customer\s*Name|A\/?c\s*Holder|Account\s*Holder(?:'s)?\s*Name)\b\s*[:.\-]?/i;

function accountDigitsIn(str) {
  // Space/hyphen-separated groups of digit look-alikes; every group must hold
  // at least one real digit, and the run must not touch a letter (so "SAVINGS"
  // after the number isn't read as "5AVING5").
  const out = [];
  const group = '[0-9OIlSB]*[0-9][0-9OIlSB]*';
  const re = new RegExp(`(^|[^A-Za-z0-9])(${group}(?:[ -]${group})*)(?![A-Za-z0-9])`, 'g');
  let m;
  while ((m = re.exec(str))) {
    const raw = m[2].replace(/[ -]/g, '');
    const digits = fixDigits(raw);
    if (/^\d{9,18}$/.test(digits)) out.push({ digits, exact: digits === raw });
  }
  return out;
}

/** @param {string | {text: string, confidence: number}[]} input */
export function parseBank(input) {
  const lines = toLines(input);
  const text = joinText(lines);
  const fields = {};

  const ifscs = findIfscs(text);
  if (ifscs.length) fields.ifsc = field(ifscs[0].value, ifscs[0].confidence);

  // Account number: labelled first.
  const accIdx = lines.findIndex((l) => ACCOUNT_LABEL.test(l.text) && !/holder|name|type/i.test(l.text));
  if (accIdx !== -1) {
    for (let j = accIdx; j < Math.min(lines.length, accIdx + 2) && !fields.accountNumber; j += 1) {
      const src = j === accIdx ? lines[j].text.slice(lines[j].text.search(ACCOUNT_LABEL)) : lines[j].text;
      const c = accountDigitsIn(src)[0];
      if (c) fields.accountNumber = field(c.digits, c.exact ? lineConfidence(lines[j], 75) : 'low');
    }
  }
  if (!fields.accountNumber) {
    // Unlabelled: the longest plausible run that isn't a phone number or the IFSC's digits.
    const all = accountDigitsIn(text).filter((c) => !/^[6-9]\d{9}$/.test(c.digits));
    all.sort((a, b) => b.digits.length - a.digits.length);
    if (all[0] && all[0].digits.length >= 11) fields.accountNumber = field(all[0].digits, 'low');
  }

  // Bank name: from the IFSC prefix if we know it, else a "... Bank ..." line.
  const prefix = fields.ifsc?.value.slice(0, 4);
  if (prefix && IFSC_BANKS[prefix]) {
    fields.bank = field(IFSC_BANKS[prefix], fields.ifsc.confidence);
  } else {
    const bankLine = lines.find((l) => /\bBank\b/i.test(latinOnly(l.text)) && latinOnly(l.text).length <= 50 && !/branch|ifsc|a\/c|account/i.test(l.text));
    if (bankLine) {
      const name = latinOnly(bankLine.text).replace(/[^A-Za-z&. -]/g, ' ').replace(/\s+/g, ' ').trim();
      if (name.length >= 6) fields.bank = field(toTitleCase(name), 'low');
    }
  }

  const holderIdx = lines.findIndex((l) => HOLDER_LABEL.test(latinOnly(l.text)));
  if (holderIdx !== -1) {
    const rest = latinOnly(lines[holderIdx].text).replace(HOLDER_LABEL, '').trim();
    const cand = rest && looksLikeName(rest) ? { text: rest, confidence: lines[holderIdx].confidence } : lines[holderIdx + 1];
    if (cand && looksLikeName(cand.text)) fields.name = field(cleanName(cand.text), lineConfidence(cand, 80));
  }

  return { kind: 'bank', fields: compactFields(fields) };
}
