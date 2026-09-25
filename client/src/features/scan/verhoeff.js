/**
 * Verhoeff checksum — the check-digit scheme UIDAI uses for the 12th digit of
 * every Aadhaar number. A single mistyped/misread digit or a swap of two
 * adjacent digits always fails it, which is exactly the kind of error OCR makes.
 */

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** True when `digits` (a string of 0-9 only, check digit last) passes Verhoeff. */
export function verhoeffValidate(digits) {
  if (!/^\d+$/.test(digits || '')) return false;
  let c = 0;
  const arr = digits.split('').reverse().map(Number);
  for (let i = 0; i < arr.length; i += 1) c = D[c][P[i % 8][arr[i]]];
  return c === 0;
}

/** Check digit to append to `digits` so the result passes `verhoeffValidate`. */
export function verhoeffCheckDigit(digits) {
  let c = 0;
  const arr = digits.split('').reverse().map(Number);
  for (let i = 0; i < arr.length; i += 1) c = D[c][P[(i + 1) % 8][arr[i]]];
  return String(INV[c]);
}

/**
 * A plausible Aadhaar number: 12 digits, doesn't start with 0 or 1 (UIDAI never
 * issues those), and passes Verhoeff.
 */
export function isValidAadhaarNumber(value) {
  const digits = String(value || '').replace(/\s+/g, '');
  return /^[2-9]\d{11}$/.test(digits) && verhoeffValidate(digits);
}

/** `234567890123` -> `2345 6789 0123` (how it's printed on the card). */
export function formatAadhaarNumber(digits) {
  const d = String(digits).replace(/\D/g, '');
  return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)}`;
}
