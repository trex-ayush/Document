import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // recommended for GCM

function keyFromEnv(b64) {
  return Buffer.from(b64, 'base64');
}

const fieldMasterKey = keyFromEnv(env.FIELD_ENCRYPTION_KEY);
const fileMasterKey = keyFromEnv(env.FILE_ENCRYPTION_KEY);

/**
 * Generic AES-256-GCM encrypt/decrypt of a Buffer with an explicit key.
 * Returns/accepts { iv, tag, ciphertext } as Buffers.
 */
export function aesEncrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ciphertext };
}

export function aesDecrypt({ iv, tag, ciphertext }, key) {
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ---------- Sensitive custom field values ----------
// Stored as a single opaque string: base64(iv).base64(tag).base64(ciphertext)

export function encryptFieldValue(plaintext) {
  const { iv, tag, ciphertext } = aesEncrypt(Buffer.from(String(plaintext), 'utf8'), fieldMasterKey);
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptFieldValue(stored) {
  const [ivB64, tagB64, ctB64] = String(stored).split('.');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed encrypted field value');
  const plaintext = aesDecrypt(
    { iv: Buffer.from(ivB64, 'base64'), tag: Buffer.from(tagB64, 'base64'), ciphertext: Buffer.from(ctB64, 'base64') },
    fieldMasterKey,
  );
  return plaintext.toString('utf8');
}

// ---------- Per-file data-key envelope encryption ----------
// Each file gets a random 32-byte data key. The data key is wrapped (encrypted) with the
// file master key and stored alongside the file metadata; file bytes are encrypted with the
// data key. This bounds the blast radius of a single leaked key and keeps master-key rotation
// (re-wrap only) cheap relative to re-encrypting every file.

export function generateFileKey() {
  return crypto.randomBytes(32);
}

export function wrapFileKey(dataKey) {
  const { iv, tag, ciphertext } = aesEncrypt(dataKey, fileMasterKey);
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    wrappedKey: ciphertext.toString('base64'),
  };
}

export function unwrapFileKey({ iv, tag, wrappedKey }) {
  return aesDecrypt(
    { iv: Buffer.from(iv, 'base64'), tag: Buffer.from(tag, 'base64'), ciphertext: Buffer.from(wrappedKey, 'base64') },
    fileMasterKey,
  );
}

/** Encrypt a whole file buffer with its own random data key. Returns ciphertext + envelope to persist. */
export function encryptFileBuffer(buffer) {
  const dataKey = generateFileKey();
  const { iv, tag, ciphertext } = aesEncrypt(buffer, dataKey);
  const wrapped = wrapFileKey(dataKey);
  return {
    ciphertext,
    encryption: { iv: iv.toString('base64'), tag: tag.toString('base64'), wrappedKey: wrapped.wrappedKey, keyIv: wrapped.iv, keyTag: wrapped.tag },
  };
}

export function decryptFileBuffer(ciphertext, encryption) {
  const dataKey = unwrapFileKey({ iv: encryption.keyIv, tag: encryption.keyTag, wrappedKey: encryption.wrappedKey });
  return aesDecrypt(
    { iv: Buffer.from(encryption.iv, 'base64'), tag: Buffer.from(encryption.tag, 'base64'), ciphertext },
    dataKey,
  );
}

// ---------- Token hashing (refresh tokens, share tokens) ----------

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// ---------- IP hashing (never store raw IPs) ----------

export function hashIp(ip) {
  if (!ip) return null;
  return sha256Hex(`${ip}:${env.JWT_ACCESS_SECRET}`).slice(0, 32);
}
