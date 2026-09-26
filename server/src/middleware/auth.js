import mongoose from 'mongoose';
import { verifyAccessToken } from '../utils/tokens.js';
import { ApiError } from './errorHandler.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';

/**
 * Multi-family sessions (docs/API.md "Multi-family sessions", docs/DECISIONS.md "Multi-family
 * accounts"): the access token only proves WHO is calling (`{ sub: userId }`) — it never says
 * WHICH family. `requireAuth` verifies the token and loads the User; if an `X-Family-Id` header
 * is present it ALSO resolves that family's live Membership (never trusting a family id from
 * anywhere else — body/query/param) and fills in the rest of `req.auth`. It never rejects for a
 * missing/non-matching header by itself — that's `requireFamily`'s job, applied per-router by
 * whichever modules actually need a resolved family (every family-scoped route already
 * destructures `req.auth` exactly the same way it always has, so nothing downstream changes).
 *
 * Sets `req.auth = { userId, familyId, membershipId, role, access, isOwner, membership, user }`:
 *  - `userId`/`user` are ALWAYS set once requireAuth succeeds (family-agnostic).
 *  - `familyId`/`membershipId`/`role`/`access`/`isOwner`/`membership` are `null` unless an
 *    `X-Family-Id` header names a family the caller has an ACTIVE membership in.
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

    const user = await User.findById(payload.sub);
    if (!user) {
      throw new ApiError(401, 'INVALID_TOKEN', 'Account no longer exists');
    }
    if (user.disabled) {
      throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account is disabled');
    }
    // Signed out everywhere after this token was issued (admin "Log out everywhere", password
    // change, removal…): reject it now. Compared in whole seconds (JWT `iat`), so a token issued
    // in the same second — e.g. the fresh one after a password change — still works.
    if (user.sessionsRevokedAt && payload.iat < Math.floor(user.sessionsRevokedAt.getTime() / 1000)) {
      throw new ApiError(401, 'SESSION_REVOKED', 'You were signed out. Please sign in again.');
    }

    const auth = {
      userId: String(user._id),
      familyId: null,
      membershipId: null,
      role: null,
      access: null,
      isOwner: null,
      membership: null,
      user,
    };

    const familyHeader = req.headers['x-family-id'];
    if (familyHeader && mongoose.isValidObjectId(familyHeader)) {
      const membership = await Membership.findOne({
        userId: user._id,
        familyId: familyHeader,
        status: 'active',
      }).lean();

      // No match (wrong family, not a member, membership disabled/invited) is NOT an error here —
      // req.auth.familyId simply stays null, same as if no header were sent at all. A family-
      // scoped route (via requireFamily below) is what turns "header sent but unresolved" into
      // 403 NOT_A_MEMBER, vs. "no header at all" into 400 MISSING_FAMILY_ID — requireAuth itself
      // stays agnostic to which of those two cases it is.
      if (membership) {
        auth.familyId = String(membership.familyId);
        auth.membershipId = String(membership._id);
        auth.role = membership.role;
        auth.access = membership.access;
        auth.isOwner = membership.isOwner;
        auth.membership = membership;
      }
    }

    req.auth = auth;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Applied by every family-scoped router AFTER `requireAuth` (`router.use(requireAuth,
 * requireFamily)`) — requires that requireAuth actually resolved a family from the `X-Family-Id`
 * header. Family-agnostic endpoints (GET/PATCH /auth/me, POST /family, /auth/logout*, etc.) use
 * `requireAuth` alone and never add this.
 */
export function requireFamily(req, res, next) {
  if (req.auth?.familyId) return next();
  if (!req.headers['x-family-id']) {
    return next(new ApiError(400, 'MISSING_FAMILY_ID', 'X-Family-Id header is required'));
  }
  next(new ApiError(403, 'NOT_A_MEMBER', 'You are not an active member of this family'));
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
