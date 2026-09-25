import { env } from '../config/env.js';
import { ApiError } from '../middleware/errorHandler.js';
import { PlatformAdmin } from '../models/PlatformAdmin.js';

// Platform (admin panel) roles — see docs/ADMIN_API.md "Roles". One place decides who is the
// super admin / an admin, so the platform-settings routes and the /api/admin module can't drift.

const norm = (email) => String(email || '').trim().toLowerCase();

/** The effective super admin email ('' when none is configured). */
export function superAdminEmail() {
  return env.EFFECTIVE_SUPER_ADMIN_EMAIL || '';
}

/** Sync: is this email the super admin? Case-insensitive. */
export function isSuperAdminEmail(email) {
  const sa = superAdminEmail();
  return Boolean(sa) && norm(email) === sa;
}

/**
 * 'super' | 'admin' | null for a user (a User doc or `{ email, disabled }`). Disabled users never
 * get a role, whatever their email.
 */
export async function getPlatformRole(user) {
  if (!user || user.disabled || !user.email) return null;
  if (isSuperAdminEmail(user.email)) return 'super';
  const found = await PlatformAdmin.exists({ email: norm(user.email) });
  return found ? 'admin' : null;
}

/** Use after requireAuth. Sets `req.platformRole`; 403 NOT_PLATFORM_ADMIN otherwise. */
export async function requirePlatformAdmin(req, res, next) {
  try {
    const role = await getPlatformRole(req.auth?.user);
    if (!role) throw new ApiError(403, 'NOT_PLATFORM_ADMIN', 'Admin access required');
    req.platformRole = role;
    next();
  } catch (err) {
    next(err);
  }
}

/** Use after requireAuth. Only the super admin passes; 403 SUPER_ADMIN_ONLY otherwise. */
export async function requireSuperAdmin(req, res, next) {
  try {
    const role = await getPlatformRole(req.auth?.user);
    if (role !== 'super') throw new ApiError(403, 'SUPER_ADMIN_ONLY', 'Only the super admin can do this');
    req.platformRole = role;
    next();
  } catch (err) {
    next(err);
  }
}
