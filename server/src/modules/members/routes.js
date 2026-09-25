import express from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';

import { requireAuth, requireFamily, requireAdmin, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { Membership } from '../../models/Membership.js';
import { User } from '../../models/User.js';
import { Family } from '../../models/Family.js';
import { revokeAllRefreshTokensForUser } from '../auth/tokenService.js';
import { serializeMembership } from '../auth/serializers.js';
import { PasswordResetToken } from '../../models/PasswordResetToken.js';
import { createMemberSchema, inviteLinkSchema, patchMemberSchema, resetPasswordSchema } from './schemas.js';
import { env, isTest } from '../../config/env.js';
import { sendMail, isEmailEnabled } from '../../services/mailer.js';
import { memberInviteEmail } from '../../services/emailTemplates.js';
import { mintPasswordResetToken } from '../../services/passwordResetTokens.js';
import { sha256Hex } from '../../utils/crypto.js';

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

/**
 * Mints a fresh invite link for `membershipId` and (unless `email: false`) queues the invite email.
 * Returns `{ url, expiresAt, emailSent }` for the API response, so the admin can also share the
 * link by hand (WhatsApp/SMS) when email is off, slow, or lands in spam.
 *
 * Multi-family (docs/DECISIONS.md "Multi-family accounts"): an invite token names the specific
 * Membership, never a userId — a user can hold several simultaneous pending invites, and (per the
 * "found an existing User" shape below) the invited email may not even have a userId of its own
 * to name.
 *
 * Minting always invalidates the previous unused invite token for this membership
 * (mintPasswordResetToken supersedes same-purpose tokens) — only the hash is stored, so an old link
 * can never be shown again; "get the link again" means "rotate", and the old link stops working.
 *
 * `emailSent` is honest but not a delivery receipt: sendMail() is fire-and-forget (never throws,
 * never awaited here so SMTP can't slow the response), so `true` means "SMTP is configured and the
 * email was queued"; `false` means email is disabled for this deployment (or was skipped).
 */
async function issueInviteLink({ familyId, inviterName, membershipId, toEmail, email = true }) {
  const raw = await mintPasswordResetToken({ membershipId }, 'invite');
  const tokenDoc = await PasswordResetToken.findOne({ tokenHash: sha256Hex(raw) }).select('expiresAt').lean();
  const url = `${env.CLIENT_URL}/accept-invite?token=${raw}`;

  let emailSent = false;
  if (email && toEmail) {
    const family = await Family.findById(familyId).select('name').lean();
    const tpl = memberInviteEmail({ familyName: family?.name || '', inviterName, acceptUrl: url });
    sendMail({ to: toEmail, subject: tpl.subject, html: tpl.html, text: tpl.text });
    emailSent = isEmailEnabled();
  }

  return { url, expiresAt: tokenDoc?.expiresAt || null, emailSent };
}

/** The address a still-pending invite goes to — `invitedEmail`, or the linked User's own email. */
async function pendingInviteEmail(membership) {
  if (membership.invitedEmail) return membership.invitedEmail;
  if (membership.userId) {
    const user = await User.findById(membership.userId).select('email').lean();
    return user?.email || null;
  }
  return null;
}

/** Loads a still-pending (`status: 'invited'`) membership in the caller's family, or throws. */
async function loadPendingInvite(req) {
  const membership = await Membership.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id }));
  if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
  if (membership.status !== 'invited') {
    throw new ApiError(400, 'NOT_INVITED', 'This member does not have a pending invite');
  }
  const toEmail = await pendingInviteEmail(membership);
  if (!toEmail) throw new ApiError(400, 'NOT_INVITED', 'This member does not have a pending invite');
  return { membership, toEmail };
}

// Per-admin cap on minting/re-sending invite links (each call can queue an email). Generous for a
// real admin, same posture as documents' revealLimiter; skipped under NODE_ENV=test like
// auth/rateLimiters.js so suites that create many invites don't trip it.
const inviteLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.membershipId || req.ip,
  skip: () => isTest,
  message: { message: 'Too many invite links requested — please try again later', code: 'RATE_LIMITED' },
});

/**
 * POST /members — admin only. The normal shape is just `{ name, email }` (see schemas.js): the
 * person is always invited, the invite email is queued, and the response includes
 * `invite: { url, expiresAt, emailSent }` so the admin can share the link themselves right away.
 *
 * Multi-family invite decoupling (docs/DECISIONS.md "Multi-family accounts"): an invite never
 * pre-creates a `User` row. It looks up `User.findOne({ email })` first:
 *  - Found (already has an account — member of another family, or already signed up
 *    independently): the Membership is created pointing straight at that `userId`, `status:
 *    'invited'` — it flips to 'active' the moment they next log in (any method), via
 *    auth/service.js's `autoJoinPendingInvites`.
 *  - Not found: the Membership is created with `userId: null, invitedEmail: email` — no `User`
 *    row until they actually sign up/log in/accept.
 * `409 ALREADY_MEMBER` when that email already has a membership (pending or not) in this family —
 * e.g. a double tap on "Add member"; the admin should use "Share invite link" on the existing row.
 *
 * Legacy shapes (API callers/tests, not the app's own form): `tempPassword` creates an ACTIVE
 * member with a `User` + that password immediately (`EMAIL_TAKEN` if the email already has an
 * account); `canLogin: false` creates a profile-only record.
 *
 * Which sign-in methods are usable is a platform-wide setting, not chosen here — every
 * login-enabled member gets a password and can link Google later (see auth/googleService.js).
 */
router.post('/', requireAdmin, validate({ body: createMemberSchema }), async (req, res, next) => {
  try {
    const { name, relation, dob, canLogin, email, tempPassword, access, sendInvite } = req.body;

    let userId = null;
    let invitedEmail = null;
    let normalizedEmail;
    let membershipStatus = 'active';
    // Always the invite path, except the legacy temp-password shape (and profile-only records).
    const useInvite = canLogin && (!tempPassword || sendInvite === true);

    if (canLogin) {
      normalizedEmail = email.toLowerCase().trim();
      const existing = await User.findOne({ email: normalizedEmail });

      if (useInvite) {
        const alreadyHere = await Membership.findOne(
          scopeToFamily(req.auth.familyId, {
            $or: [{ invitedEmail: normalizedEmail }, ...(existing ? [{ userId: existing._id }] : [])],
          }),
        ).select('_id').lean();
        if (alreadyHere) {
          throw new ApiError(409, 'ALREADY_MEMBER', 'This email is already a member of this family (or already invited)');
        }

        membershipStatus = 'invited';
        if (existing) {
          userId = existing._id;
        } else {
          invitedEmail = normalizedEmail;
        }
      } else {
        if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

        // Every login-enabled member gets a password up front; Google can still be linked later
        // (automatically on that email's first POST /auth/google, or explicitly via
        // POST /auth/google/link) — see googleService.js.
        const userDoc = { name, email: normalizedEmail, passwordHash: await bcrypt.hash(tempPassword, BCRYPT_COST) };
        const user = await User.create(userDoc);
        userId = user._id;
      }
    }

    const membership = await Membership.create({
      familyId: req.auth.familyId,
      userId,
      invitedEmail,
      // No per-member admin choice of sign-in method anymore — always 'both' so the invite
      // acceptance flow (auth/service.js) still offers Google alongside the password form.
      invitedLoginMethod: invitedEmail ? 'both' : null,
      name,
      relation: relation || '',
      dob: dob || null,
      role: 'member',
      access: canLogin ? access : 'read',
      canLogin,
      isOwner: false,
      status: membershipStatus,
    });

    let invite;
    if (useInvite) {
      invite = await issueInviteLink({
        familyId: req.auth.familyId,
        inviterName: req.auth.membership?.name,
        membershipId: membership._id,
        toEmail: normalizedEmail,
        email: sendInvite !== false,
      });
    }

    await logActivity(req, { action: 'member.create', targetType: 'membership', targetId: membership._id });

    const body = serializeMembership(membership, { userEmail: canLogin ? normalizedEmail : undefined });
    if (invite) body.invite = invite;
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /members/:id/invite-link — admin only, only for `status: 'invited'` members. Returns a
 * fresh invite link `{ url, expiresAt, emailSent }` for the admin to copy/share (e.g. they closed
 * the "Share invite" step before sending it). Tokens are stored hashed, so this ROTATES: a new
 * link is minted and the previous one stops working. Body `{ resend: true }` (or `?resend=1`) also
 * emails the new link to the invitee; otherwise no email is sent (`emailSent: false`).
 */
router.post('/:id/invite-link', requireAdmin, inviteLinkLimiter, validate({ body: inviteLinkSchema }), async (req, res, next) => {
  try {
    const { membership, toEmail } = await loadPendingInvite(req);
    const resend = req.body.resend === true || ['1', 'true'].includes(String(req.query.resend || ''));

    const invite = await issueInviteLink({
      familyId: req.auth.familyId,
      inviterName: req.auth.membership?.name,
      membershipId: membership._id,
      toEmail,
      email: resend,
    });

    await logActivity(req, {
      action: 'member.resend_invite',
      targetType: 'membership',
      targetId: membership._id,
      meta: { emailed: resend },
    });

    res.json(invite);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /members/:id/resend-invite — admin only, only for `status: 'invited'` members. Works for
 * BOTH invite shapes (userId already known, or still just an invitedEmail). Rotates the invite
 * token (the old link stops working) and emails the fresh one. Kept for existing callers;
 * POST /members/:id/invite-link with `resend: true` does the same and also returns the link.
 */
router.post('/:id/resend-invite', requireAdmin, inviteLinkLimiter, async (req, res, next) => {
  try {
    const { membership, toEmail } = await loadPendingInvite(req);

    await issueInviteLink({
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
