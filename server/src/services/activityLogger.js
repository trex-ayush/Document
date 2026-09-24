import { Activity } from '../models/Activity.js';
import { hashIp } from '../utils/crypto.js';

/**
 * Log an important action. Call as `logActivity(req, { action, targetType, targetId, ... })`.
 * `req` may be a real Express request (authenticated or public) or a minimal
 * `{ auth, ip, headers }`-shaped object for contexts without a live request (e.g. seed script).
 *
 * NEVER pass a sensitive field's decrypted value in `meta` — for field.update, log the changed
 * *keys* only (see docs/API.md's Activity section).
 */
export async function logActivity(req, { action, targetType = null, targetId = null, documentId = null, folderId = null, shareId = null, meta = {}, familyId = null, actorName = null }) {
  const auth = req?.auth || null;
  const resolvedFamilyId = familyId || auth?.familyId;
  if (!resolvedFamilyId) {
    // eslint-disable-next-line no-console
    console.warn(`[activity] dropped "${action}" — no familyId available`);
    return null;
  }

  const doc = await Activity.create({
    familyId: resolvedFamilyId,
    actorMembershipId: auth?.membershipId || null,
    actorName: actorName || auth?.membership?.name || 'Visitor',
    action,
    targetType,
    targetId,
    documentId,
    folderId,
    shareId,
    meta,
    ipHash: hashIp(getIp(req)),
    userAgent: (req?.headers?.['user-agent'] || '').slice(0, 300),
  });
  return doc;
}

function getIp(req) {
  if (!req) return null;
  return req.ip || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}
