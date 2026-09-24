import mongoose from 'mongoose';
import { verifyAccessToken } from '../utils/tokens.js';
import { ApiError } from './errorHandler.js';
import { Membership } from '../models/Membership.js';

/**
 * Verifies the bearer access token, loads the live membership (so a disabled member or a
 * revoked/changed role takes effect immediately, not just after their token expires), and sets
 * `req.auth = { userId, membershipId, familyId, role, access, membership }`.
 *
 * `req.auth.familyId` is the ONLY source of truth for tenant scoping downstream — every module
 * must build queries via `scopeToFamily(req.auth.familyId, {...})`, never from a body/query/param.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Missing bearer token');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired access token');
    }

    const membership = await Membership.findOne({
      _id: payload.membershipId,
      familyId: payload.familyId,
    }).lean();

    if (!membership || membership.status === 'disabled') {
      throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account is disabled');
    }

    req.auth = {
      userId: payload.sub,
      membershipId: String(membership._id),
      familyId: String(membership.familyId),
      role: membership.role,
      access: membership.access,
      isOwner: membership.isOwner,
      membership,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** role === 'admin' OR access === 'write'. Admins implicitly have full access. */
export function requireWrite(req, res, next) {
  if (req.auth?.role === 'admin' || req.auth?.access === 'write') return next();
  next(new ApiError(403, 'FORBIDDEN', 'Write access required'));
}

export function requireAdmin(req, res, next) {
  if (req.auth?.role === 'admin') return next();
  next(new ApiError(403, 'FORBIDDEN', 'Admin access required'));
}

/**
 * Merge a Mongo filter with the caller's familyId. ALWAYS use this (never hand-roll
 * `{ familyId }`) so tenant scoping is grep-able and consistent across every module.
 *
 *   Document.find(scopeToFamily(req.auth.familyId, { folderId }))
 */
export function scopeToFamily(familyId, extra = {}) {
  if (!familyId) throw new Error('scopeToFamily called without a familyId');
  return { ...extra, familyId: new mongoose.Types.ObjectId(String(familyId)) };
}
