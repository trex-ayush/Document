import { encryptFieldValue, decryptFieldValue } from '../../utils/crypto.js';

/**
 * At-rest encryption for free-text values (document notes, and a password item's username,
 * password, field values and notes). Empty stays empty — nothing to hide, and it keeps "has a
 * value?" checks cheap. Shared by the documents and items modules (and safe for search to use).
 */
export function sealText(plaintext) {
  const str = plaintext == null ? '' : String(plaintext);
  return str ? encryptFieldValue(str) : '';
}

/** Reverse of sealText. A value that can't be decrypted comes back as '' rather than throwing. */
export function openText(stored) {
  if (!stored) return '';
  try {
    return decryptFieldValue(stored);
  } catch {
    return '';
  }
}
