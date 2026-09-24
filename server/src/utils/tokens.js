import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ACCESS_TOKEN_TTL = '15m';
const FILE_TOKEN_TTL = '1h';
const REAUTH_TOKEN_TTL = '5m';

/** Access token: identifies the authenticated user + their membership + family + role/access. */
export function signAccessToken({ userId, membershipId, familyId, role, access }) {
  return jwt.sign(
    { sub: String(userId), membershipId: String(membershipId), familyId: String(familyId), role, access },
    env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
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
  return jwt.sign(
    { membershipId: String(membershipId), familyId: String(familyId), purpose: 'reauth' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: REAUTH_TOKEN_TTL },
  );
}

export function verifyReauthToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (payload.purpose !== 'reauth') throw new Error('Not a reauth token');
  return payload;
}
