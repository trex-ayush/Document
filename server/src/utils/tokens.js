import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ACCESS_TOKEN_TTL = '15m';
const FILE_TOKEN_TTL = '1h';
const REAUTH_TOKEN_TTL = '5m';

/**
 * Access token: proves WHO is calling — `{ sub: userId }` only. It deliberately does NOT carry
 * `membershipId`/`familyId`/`role`/`access` (docs/API.md "Multi-family sessions" /
 * docs/DECISIONS.md "Multi-family accounts"): a user can belong to any number of families, so
 * baking "which family" into a 15-minute token would go stale the moment they're added to /
 * removed from one, or have their role/access changed. "Which family" is resolved fresh on every
 * request from the `X-Family-Id` header (see middleware/auth.js's `requireAuth`/`requireFamily`).
 */
export function signAccessToken({ userId }) {
  return jwt.sign({ sub: String(userId) }, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

/**
 * Signed file token: short-lived, scoped to exactly one file, one purpose and one family.
 * Embedded as a query param in `url`/`thumbUrl`/`downloadUrl` so <img> tags and plain <a> downloads
 * work without an Authorization header.
 */
export function signFileToken({ fileId, documentId, familyId, purpose, kind }) {
  return jwt.sign(
    { fileId: String(fileId), documentId: String(documentId), familyId: String(familyId), purpose, kind },
    env.FILE_TOKEN_SECRET,
    { expiresIn: FILE_TOKEN_TTL },
  );
}

export function verifyFileToken(token) {
  return jwt.verify(token, env.FILE_TOKEN_SECRET);
}

/**
 * Reauth token: proves the caller re-entered their password in the last 5 minutes. Required
 * (when Family.settings.requireReauthForSecrets is on) to reveal a sensitive custom field value
 * — see POST /auth/reauth and GET /documents/:id/fields/:fieldId/reveal in docs/API.md. Sent as
 * the `X-Reauth` header. Stateless JWT (no DB row) is fine here: it grants no privilege beyond
 * "I recently typed my password", it's already scoped to one membership, and 5 minutes is short
 * enough that revocation-on-logout isn't worth the extra collection.
 */
export function signReauthToken({ membershipId, familyId }) {
  // `membershipId`/`familyId` are `null` for a cold (family-less) user reauth-ing to set a
  // password before onboarding — String(null) would silently become the literal string "null",
  // which then never strictly-equals the real `null` a consumer compares it against. Preserve
  // null/undefined as-is; only stringify a real id.
  return jwt.sign(
    {
      membershipId: membershipId ? String(membershipId) : null,
      familyId: familyId ? String(familyId) : null,
      purpose: 'reauth',
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: REAUTH_TOKEN_TTL },
  );
}

export function verifyReauthToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (payload.purpose !== 'reauth') throw new Error('Not a reauth token');
  return payload;
}
