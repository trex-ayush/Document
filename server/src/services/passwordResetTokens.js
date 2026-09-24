import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { generateOpaqueToken, sha256Hex } from '../utils/crypto.js';

// Shared by auth's forgot-password/reset-password AND the members module's invite flow — both
// are the same "opaque capability token, single-use, expires" shape (docs/DECISIONS.md-style
// note in this agent's final report), just a different `purpose` + TTL.
const TOKEN_TTL_MS = {
  reset: 30 * 60 * 1000, // 30 minutes
  invite: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Mints a brand-new token for `purpose`, first invalidating any other still-unused token of the
 * SAME purpose for this user (so an old, unclicked reset/invite link stops working the moment a
 * newer one is issued — e.g. "resend invite"). Returns the RAW token: only ever put in the email
 * link, never stored or logged — only its SHA-256 hash is persisted.
 */
export async function mintPasswordResetToken(userId, purpose) {
  await PasswordResetToken.updateMany({ userId, purpose, usedAt: null }, { usedAt: new Date() });

  const raw = generateOpaqueToken();
  await PasswordResetToken.create({
    userId,
    purpose,
    tokenHash: sha256Hex(raw),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
  });
  return raw;
}

/**
 * Looks up a token by its raw value + expected purpose, validating it's not expired/used.
 * Returns the token document (NOT yet marked used — callers mark it used only after finishing
 * their own work, e.g. after the password is actually changed) or `null`.
 */
export async function findValidPasswordResetToken(rawToken, purpose) {
  if (!rawToken) return null;
  const tokenHash = sha256Hex(rawToken);
  const tokenDoc = await PasswordResetToken.findOne({ tokenHash, purpose });
  if (!tokenDoc) return null;
  if (tokenDoc.usedAt) return null;
  if (tokenDoc.expiresAt.getTime() < Date.now()) return null;
  return tokenDoc;
}
