import express from 'express';
import bcrypt from 'bcryptjs';

import { requireAuth, requireAdmin, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { Membership } from '../../models/Membership.js';
import { User } from '../../models/User.js';
import { Family } from '../../models/Family.js';
import { revokeAllRefreshTokensForUser } from '../auth/tokenService.js';
import { serializeMembership } from '../auth/serializers.js';
import { createMemberSchema, patchMemberSchema, resetPasswordSchema } from './schemas.js';
import { env } from '../../config/env.js';
import { sendMail, isEmailEnabled } from '../../services/mailer.js';
import { memberInviteEmail } from '../../services/emailTemplates.js';
import { mintPasswordResetToken } from '../../services/passwordResetTokens.js';

const BCRYPT_COST = 12;
const router = express.Router();

router.use(requireAuth);

/** GET /members — every membership in the caller's family, with user.email when canLogin. */
router.get('/', async (req, res, next) => {
  try {
    const memberships = await Membership.find(scopeToFamily(req.auth.familyId)).sort({ isOwner: -1, createdAt: 1 });

    const userIds = memberships.filter((m) => m.canLogin && m.userId).map((m) => m.userId);
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }, 'email avatarUrl avatarColor').lean() : [];
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const items = memberships.map((m) => {
      const u = m.userId ? userById.get(String(m.userId)) : undefined;
      return serializeMembership(m, { userEmail: u?.email, userAvatarUrl: u?.avatarUrl, userAvatarColor: u?.avatarColor });
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/** authProviders to seed on an invite-flow User row (no passwordHash yet either way). */
function authProvidersForInvite(loginMethod) {
  if (loginMethod === 'google') return ['google'];
  if (loginMethod === 'both') return ['password', 'google'];
  return ['password'];
}

async function sendInviteEmail({ familyId, inviterName, userId, toEmail }) {
  const raw = await mintPasswordResetToken(userId, 'invite');
  const acceptUrl = `${env.CLIENT_URL}/accept-invite?token=${raw}`;
  const family = await Family.findById(familyId).select('name').lean();
  const tpl = memberInviteEmail({ familyName: family?.name || '', inviterName, acceptUrl });
  sendMail({ to: toEmail, subject: tpl.subject, html: tpl.html, text: tpl.text });
}

/** POST /members — admin only. Two shapes: login-enabled vs profile-only (see schemas.js). */
router.post('/', requireAdmin, validate({ body: createMemberSchema }), async (req, res, next) => {
  try {
    const { name, relation, dob, canLogin, email, tempPassword, access, loginMethod, sendInvite } = req.body;

    let userId = null;
    let normalizedEmail;
    let membershipStatus = 'active';
    const useInvite = canLogin && (sendInvite !== undefined ? sendInvite : isEmailEnabled());

    if (canLogin) {
      normalizedEmail = email.toLowerCase().trim();
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

      const userDoc = { name, email: normalizedEmail };
      if (useInvite) {
        // Deferred password — the invitee sets it themselves via POST /auth/accept-invite (or
        // signs in with Google directly, if loginMethod allows it; see
        // auth/service.js's loadActiveMembershipOrThrow). No passwordHash yet.
        userDoc.authProviders = authProvidersForInvite(loginMethod);
        membershipStatus = 'invited';
      } else if (loginMethod === 'google') {
        // loginMethod 'google', no invite email: no password at all — this User row has nothing
        // to authenticate with yet, until that email's owner signs in via POST /auth/google,
        // which finds this User by email and links `googleId`/`authProviders` automatically
        // (see googleService.js).
        userDoc.authProviders = ['google'];
      } else {
        userDoc.passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);
      }
      const user = await User.create(userDoc);
      userId = user._id;
    }

    const membership = await Membership.create({
      familyId: req.auth.familyId,
      userId,
      name,
      relation: relation || '',
      dob: dob || null,
      role: 'member',
      access: canLogin ? access : 'read',
      canLogin,
      isOwner: false,
      status: membershipStatus,
    });

    if (useInvite) {
      await sendInviteEmail({
        familyId: req.auth.familyId,
        inviterName: req.auth.membership?.name,
        userId,
        toEmail: normalizedEmail,
      });
    }

    await logActivity(req, { action: 'member.create', targetType: 'membership', targetId: membership._id });

    res.status(201).json(serializeMembership(membership, { userEmail: canLogin ? normalizedEmail : undefined }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /members/:id/resend-invite — admin only, only for `status: 'invited'` members.
 * Invalidates the old invite token (mintPasswordResetToken supersedes any unused token of the
 * same purpose) and sends a fresh one.
 */
router.post('/:id/resend-invite', requireAdmin, async (req, res, next) => {
  try {
    const membership = await Membership.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id }));
    if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
    if (membership.status !== 'invited' || !membership.userId) {
      throw new ApiError(400, 'NOT_INVITED', 'This member does not have a pending invite');
    }

    const user = await User.findById(membership.userId).select('email').lean();
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');

    await sendInviteEmail({
      familyId: req.auth.familyId,
      inviterName: req.auth.membership?.name,
      userId: membership.userId,
      toEmail: user.email,
    });

    await logActivity(req, { action: 'member.resend_invite', targetType: 'membership', targetId: membership._id });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** PATCH /members/:id — admin only. Disabling revokes all of that member's refresh tokens. */
router.patch('/:id', requireAdmin, validate({ body: patchMemberSchema }), async (req, res, next) => {
  try {
    const membership = await Membership.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id }));
    if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Member not found');

    if (membership.isOwner && req.body.status === 'disabled') {
      throw new ApiError(400, 'CANNOT_REMOVE_OWNER', 'The family owner cannot be disabled');
    }

    const wasActive = membership.status === 'active';
    Object.assign(membership, req.body);
    await membership.save();

    if (wasActive && membership.status === 'disabled' && membership.userId) {
      await revokeAllRefreshTokensForUser(membership.userId);
    }

    await logActivity(req, {
      action: 'member.update',
      targetType: 'membership',
      targetId: membership._id,
      meta: { changedKeys: Object.keys(req.body) },
    });

    let userEmail;
    if (membership.canLogin && membership.userId) {
      const u = await User.findById(membership.userId, 'email').lean();
      userEmail = u?.email;
    }
    res.json(serializeMembership(membership, { userEmail }));
  } catch (err) {
    next(err);
  }
});

/** POST /members/:id/reset-password — admin only. Revokes all of that member's refresh tokens. */
router.post(
  '/:id/reset-password',
  requireAdmin,
  validate({ body: resetPasswordSchema }),
  async (req, res, next) => {
    try {
      const membership = await Membership.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id }));
      if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
      if (!membership.canLogin || !membership.userId) {
        throw new ApiError(400, 'NOT_LOGIN_ENABLED', 'This member has no login to reset a password for');
      }

      const passwordHash = await bcrypt.hash(req.body.newPassword, BCRYPT_COST);
      await User.findByIdAndUpdate(membership.userId, { passwordHash });
      await revokeAllRefreshTokensForUser(membership.userId);

      await logActivity(req, {
        action: 'member.reset_password',
        targetType: 'membership',
        targetId: membership._id,
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /members/:id — admin only. The owner membership can never be removed. */
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const membership = await Membership.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id }));
    if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
    if (membership.isOwner) throw new ApiError(400, 'CANNOT_REMOVE_OWNER', 'The family owner cannot be removed');

    if (membership.userId) await revokeAllRefreshTokensForUser(membership.userId);
    await membership.deleteOne();

    // Note: intentionally does NOT delete the underlying User account (models/User.js isn't
    // this module's file to touch, and a User could in principle back memberships in more than
    // one family per docs/DECISIONS.md's "future multi-family user" note). A User left with zero
    // active memberships simply has nothing to authenticate into within this app.

    // `meta.name` (email module): lets the admin instant alert (services/alerts.js) name the
    // removed member without a second lookup after the Membership row is already gone.
    await logActivity(req, { action: 'member.delete', targetType: 'membership', targetId: req.params.id, meta: { name: membership.name } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
