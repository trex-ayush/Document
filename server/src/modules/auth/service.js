import bcrypt from 'bcryptjs';

import { User } from '../../models/User.js';
import { Family } from '../../models/Family.js';
import { Membership } from '../../models/Membership.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { signReauthToken } from '../../utils/tokens.js';
import { seedFamilyDefaults } from '../../seed/seedFamilyDefaults.js';
import * as tokenService from './tokenService.js';
import { serializeUser, serializeMembership, serializeFamily } from './serializers.js';

const BCRYPT_COST = 12;

function slugify(input) {
  return (
    input
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'family'
  );
}

async function generateUniqueSlug(name) {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Family.exists({ slug })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function reqCtx(req) {
  // logActivity accepts either a real Express req or this minimal shape.
  return { headers: req?.headers, ip: req?.ip, socket: req?.socket };
}

/** POST /auth/signup — creates Family + owning User + admin Membership, seeds defaults. */
export async function signup({ familyName, name, email, password }, req) {
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await User.create({ name, email: normalizedEmail, passwordHash, lastLoginAt: new Date() });

  const slug = await generateUniqueSlug(familyName);
  const family = await Family.create({ name: familyName, slug, createdBy: user._id });

  const membership = await Membership.create({
    familyId: family._id,
    userId: user._id,
    name,
    role: 'admin',
    access: 'write',
    canLogin: true,
    isOwner: true,
    status: 'active',
  });

  await seedFamilyDefaults({ familyId: family._id, membershipId: membership._id });

  const { accessToken, refreshToken } = await tokenService.issueTokenPair({
    userId: user._id,
    familyId: family._id,
    membershipId: membership._id,
    role: membership.role,
    access: membership.access,
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });

  await logActivity(reqCtx(req), {
    action: 'auth.signup',
    targetType: 'family',
    targetId: family._id,
    familyId: family._id,
    actorName: name,
  });

  return { user, membership, family, accessToken, refreshToken };
}

/** POST /auth/login */
export async function login({ email, password }, req) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const membership = await Membership.findOne({ userId: user._id }).sort({ isOwner: -1, createdAt: 1 });
  if (!membership) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (membership.status === 'disabled') {
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
  }

  const family = await Family.findById(membership.familyId);

  user.lastLoginAt = new Date();
  await user.save();

  const { accessToken, refreshToken } = await tokenService.issueTokenPair({
    userId: user._id,
    familyId: membership.familyId,
    membershipId: membership._id,
    role: membership.role,
    access: membership.access,
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });

  await logActivity(reqCtx(req), {
    action: 'auth.login',
    targetType: 'user',
    targetId: user._id,
    familyId: membership.familyId,
    actorName: membership.name,
  });

  return { user, membership, family, accessToken, refreshToken };
}

/** POST /auth/refresh */
export async function refresh(rawToken, req) {
  return tokenService.rotateRefreshToken(rawToken, {
    userAgent: req?.headers?.['user-agent'],
    ip: req?.ip,
  });
}

/** POST /auth/logout */
export async function logout(rawToken, req) {
  await tokenService.revokeRefreshToken(rawToken);
  if (req?.auth) {
    await logActivity(req, { action: 'auth.logout' });
  }
}

/** POST /auth/logout-all */
export async function logoutAll(userId, req) {
  await tokenService.revokeAllRefreshTokensForUser(userId);
  await logActivity(req, { action: 'auth.logout_all', targetType: 'user', targetId: userId });
}

/** GET /auth/me — returns already-serialized {user, membership, family}. */
export async function getMe(auth) {
  const [user, family] = await Promise.all([User.findById(auth.userId), Family.findById(auth.familyId)]);
  if (!user || !family) throw new ApiError(404, 'NOT_FOUND', 'Account not found');

  return {
    user: serializeUser(user),
    membership: serializeMembership(auth.membership, { userEmail: user.email }),
    family: serializeFamily(family),
  };
}

/** PATCH /auth/me */
export async function updateMe(userId, patch) {
  const update = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.avatarColor !== undefined) update.avatarColor = patch.avatarColor;

  const user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  return user;
}

/** POST /auth/change-password */
export async function changePassword(userId, { currentPassword, newPassword }, req) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new ApiError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await user.save();

  // Defensive: a changed password invalidates every existing refresh token (forces re-login on
  // every other device/session), same security posture as a member password reset by an admin.
  await tokenService.revokeAllRefreshTokensForUser(userId);

  await logActivity(req, { action: 'auth.change_password', targetType: 'user', targetId: userId });
}

/** POST /auth/reauth */
export async function reauth(auth, password, req) {
  const user = await User.findById(auth.userId);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new ApiError(401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');

  const reauthToken = signReauthToken({ membershipId: auth.membershipId, familyId: auth.familyId });

  await logActivity(req, { action: 'auth.reauth', targetType: 'membership', targetId: auth.membershipId });

  return { reauthToken };
}
