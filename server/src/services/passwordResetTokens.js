import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { generateOpaqueToken, sha256Hex } from '../utils/crypto.js';

// Shared by auth's forgot-password/reset-password AND the members module's invite flow — both
// are the same "opaque capability token, single-use, expires" shape, just a different `purpose` +
// TTL.
const TOKEN_TTL_MS = {
  reset: 30 * 60 * 1000, // 30 minutes
  invite: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Mints a brand-new token for `purpose`, tied to exactly one of `{ userId }` / `{ membershipId }`
 * (multi-family, docs/DECISIONS.md "Multi-family accounts"):
 *  - `purpose: 'reset'` is always `{ userId }` — a password reset always names a real, existing
 *    User.
 *  - `purpose: 'invite'` is always `{ membershipId }` — naming the SPECIFIC Membership being
 *    invited, never just a `userId`, because a user can now hold several memberships (including
 *    several simultaneous pending invites across different families), so `userId` alone can't say
 *    which one a given invite link is for.
 *
 * First invalidates any other still-unused token of the SAME purpose for the SAME subject (so an
 * old, unclicked reset/invite link stops working the moment a newer one is issued — e.g. "resend
 * invite"). Returns the RAW token: only ever put in the email link, never stored or logged — only
 * its SHA-256 hash is persisted.
 */
export async function mintPasswordResetToken({ userId = null, membershipId = null } = {}, purpose) {
  const subjectFilter = userId ? { userId, purpose, usedAt: null } : { membershipId, purpose, usedAt: null };
  await PasswordResetToken.updateMany(subjectFilter, { usedAt: new Date() });

  const raw = generateOpaqueToken();
  await PasswordResetToken.create({
    userId: userId || null,
    membershipId: membershipId || null,
    purpose,
    tokenHash: sha256Hex(raw),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
  });
  return raw;
}

/**
 * Looks up a token by its raw value + expected purpose, validating it's not expired/used.
 * Returns the token document (NOT yet marked used — callers mark it used only after finishing
 * their own work, e.g. after the password is actually changed) or `null`. The returned doc has
 * EITHER `userId` OR `membershipId` set (never both) — callers branch on which.
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
