import express from 'express';
import bcrypt from 'bcryptjs';

import { requireAuth, requireFamily, requireAdmin, scopeToFamily } from '../../middleware/auth.js';
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

router.use(requireAuth, requireFamily);

/** GET /members — every membership in the caller's family, with user.email when canLogin. */
router.get('/', async (req, res, next) => {
  try {
    const memberships = await Membership.find(scopeToFamily(req.auth.familyId)).sort({ isOwner: -1, createdAt: 1 });

    const userIds = memberships.filter((m) => m.canLogin && m.userId).map((m) => m.userId);
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }, 'email avatarUrl avatarColor').lean() : [];
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const items = memberships.map((m) => {
      const u = m.userId ? userById.get(String(m.userId)) : undefined;
      // A still-pending invite for an email with no User row yet has nothing in `userById` — fall
      // back to the invited email itself so the admin's member list still shows who was invited.
      const email = u?.email || m.invitedEmail || undefined;
      return serializeMembership(m, { userEmail: email, userAvatarUrl: u?.avatarUrl, userAvatarColor: u?.avatarColor });
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

async function sendInviteEmail({ familyId, inviterName, membershipId, toEmail }) {
  // Multi-family (docs/DECISIONS.md "Multi-family accounts"): an invite token names the specific
  // Membership, never a userId — a user can hold several simultaneous pending invites, and (per
  // the "found an existing User" shape below) the invited email may not even have a userId of its
  // own to name.
  const raw = await mintPasswordResetToken({ membershipId }, 'invite');
  const acceptUrl = `${env.CLIENT_URL}/accept-invite?token=${raw}`;
  const family = await Family.findById(familyId).select('name').lean();
  const tpl = memberInviteEmail({ familyName: family?.name || '', inviterName, acceptUrl });
  sendMail({ to: toEmail, subject: tpl.subject, html: tpl.html, text: tpl.text });
}

/**
 * POST /members — admin only. Two shapes: login-enabled vs profile-only (see schemas.js).
 *
 * Multi-family invite decoupling (docs/DECISIONS.md "Multi-family accounts"): the login-enabled +
 * invite shape no longer pre-creates a `User` row. It looks up `User.findOne({ email })` first:
 *  - Found (already has an account — member of another family, or already signed up
 *    independently): the Membership is created pointing straight at that `userId`, `status:
 *    'invited'` — it flips to 'active' the moment they next log in (any method), via
 *    auth/service.js's `autoJoinPendingInvites`.
 *  - Not found: the Membership is created with `userId: null, invitedEmail: email,
 *    invitedLoginMethod: loginMethod` — no `User` row until they actually sign up/log in/accept.
 * Either way an invite email is still sent (nice UX even though auto-join would catch it on their
 * next login regardless).
 *
 * The non-invite fallback (`sendInvite:false`, temp password) is unaffected — still creates the
 * `User` immediately with the temp password, exactly as before; `EMAIL_TAKEN` still applies there
 * since a temp-password User can't be created for an email that already has one.
 */
router.post('/', requireAdmin, validate({ body: createMemberSchema }), async (req, res, next) => {
  try {
    const { name, relation, dob, canLogin, email, tempPassword, access, loginMethod, sendInvite } = req.body;

    let userId = null;
    let invitedEmail = null;
    let normalizedEmail;
    let membershipStatus = 'active';
    const useInvite = canLogin && (sendInvite !== undefined ? sendInvite : isEmailEnabled());

    if (canLogin) {
      normalizedEmail = email.toLowerCase().trim();
      const existing = await User.findOne({ email: normalizedEmail });

      if (useInvite) {
        membershipStatus = 'invited';
        if (existing) {
          userId = existing._id;
        } else {
          invitedEmail = normalizedEmail;
        }
      } else {
        if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

        const userDoc = { name, email: normalizedEmail };
        if (loginMethod === 'google') {
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
    }

    const membership = await Membership.create({
      familyId: req.auth.familyId,
      userId,
      invitedEmail,
      invitedLoginMethod: invitedEmail ? loginMethod : null,
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
        membershipId: membership._id,
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
 * POST /members/:id/resend-invite — admin only, only for `status: 'invited'` members. Works for
 * BOTH invite shapes now (userId already known, or still just an invitedEmail). Invalidates the
 * old invite token (mintPasswordResetToken supersedes any unused token of the same purpose) and
 * sends a fresh one.
 */
router.post('/:id/resend-invite', requireAdmin, async (req, res, next) => {
  try {
    const membership = await Membership.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id }));
    if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
    if (membership.status !== 'invited') {
      throw new ApiError(400, 'NOT_INVITED', 'This member does not have a pending invite');
    }

    let toEmail = membership.invitedEmail;
    if (!toEmail && membership.userId) {
      const user = await User.findById(membership.userId).select('email').lean();
      toEmail = user?.email;
    }
    if (!toEmail) throw new ApiError(400, 'NOT_INVITED', 'This member does not have a pending invite');

    await sendInviteEmail({
      familyId: req.auth.familyId,
      inviterName: req.auth.membership?.name,
      membershipId: membership._id,
      toEmail,
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
    if (membership.canLogin) {
      if (membership.userId) {
        const u = await User.findById(membership.userId, 'email').lean();
        userEmail = u?.email;
      } else {
        userEmail = membership.invitedEmail || undefined;
      }
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
