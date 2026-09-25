import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ACCESS_TOKEN_TTL = '15m';
const FILE_TOKEN_TTL = '1h';

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
