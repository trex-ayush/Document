/**
 * Short-lived signed "zip job" tokens — the same pattern as `signFileToken`/`verifyFileToken` in
 * utils/tokens.js (which is scoped to exactly one file and can't be reused here), reusing the same
 * FILE_TOKEN_SECRET but with its own payload shape (`t: 'zip'`) so the two token kinds can never be
 * cross-used. `POST /folders/:id/zip-link` and `POST /documents/:id/zip-link` mint one of these and
 * return a URL of the form `/api/files/zip/<token>`; `GET /files/zip/:token` (this module) verifies
 * it and streams the archive — see that route for the streaming side.
 */
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const ZIP_TOKEN_TTL = '5m';

export function signZipToken({ scope, targetId, familyId, fileIds }) {
  const payload = { t: 'zip', scope, targetId: String(targetId), familyId: String(familyId) };
  if (fileIds && fileIds.length) payload.fileIds = fileIds.map(String);
  return jwt.sign(payload, env.FILE_TOKEN_SECRET, { expiresIn: ZIP_TOKEN_TTL });
}

export function verifyZipToken(token) {
  const payload = jwt.verify(token, env.FILE_TOKEN_SECRET);
  if (payload.t !== 'zip') throw new Error('Not a zip token');
  return payload;
}
