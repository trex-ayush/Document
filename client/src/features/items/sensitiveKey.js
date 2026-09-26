/**
 * Does an extra field's name look like it holds a secret (a PIN, password, OTP, CVV…)?
 * Such fields default to "Keep secret": hidden on the item page and left out of search.
 *
 * Kept byte-for-byte identical in server/src/modules/items/sensitiveKey.js and
 * client/src/features/items/sensitiveKey.js (a server test checks they match).
 */

// Whole words (case-insensitive): "ATM PIN", "mPIN", "UPI-PIN", "Login password", "CVV2"…
const SENSITIVE_WORD = /^(?:[mt]?pins?|pass(?:words?|codes?|wd)|pwds?|otps?|cvv2?|cvc2?|secrets?|पिन|पासवर्ड)$/;

/** Split a field name into lowercase words (letters incl. Devanagari vowel signs, and digits). */
function words(key) {
  return String(key || '')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

/** True when the field name looks sensitive, e.g. "ATM PIN", "UPI pin", "Wi-Fi password", "पिन". */
export function isSensitiveKey(key) {
  const list = words(key);
  if (list.some((w) => SENSITIVE_WORD.test(w))) return true;
  // "Security answer" / "security question answer".
  return list.includes('security') && list.includes('answer');
}

/**
 * Whether a saved field is secret. Fields saved before the "Keep secret" flag existed have no
 * `secret`: they are secret when their name looks sensitive.
 */
export function isSecretField(field) {
  if (typeof field?.secret === 'boolean') return field.secret;
  return isSensitiveKey(field?.key);
}
