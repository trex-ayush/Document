import express from 'express';

import { requireAuth, requireAdmin, requireFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { Family } from '../../models/Family.js';
import { Membership } from '../../models/Membership.js';
import { User } from '../../models/User.js';
import { seedFamilyDefaults } from '../../seed/seedFamilyDefaults.js';
import { serializeFamily, serializeMembership } from '../auth/serializers.js';
import { createFamilySchema, patchFamilySchema } from './schemas.js';
import { sendMailNow, isEmailEnabled } from '../../services/mailer.js';
import { testEmail } from '../../services/emailTemplates.js';

const router = express.Router();

// Only `requireAuth` at the router level — POST / (create) is deliberately family-agnostic (it's
// how a caller GETS their first family; requiring one already would be circular). Every other
// route below adds `requireFamily` itself. See docs/API.md "Multi-family sessions".
router.use(requireAuth);

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

/**
 * POST /family — auth required, NO X-Family-Id needed. Creates a brand-new Family + an
 * owner/admin Membership for the caller + seeds the family defaults, e.g. the Shared folder (the same
 * seed logic POST /auth/signup used to run inline before multi-family — see
 * docs/DECISIONS.md "Multi-family accounts"). Used by both first-run onboarding (GET /auth/me
 * returned `memberships: []`) and an existing user's "+ Create a new family" action.
 */
router.post('/', validate({ body: createFamilySchema }), async (req, res, next) => {
  try {
    const { familyName } = req.body;
    const slug = await generateUniqueSlug(familyName);
    const family = await Family.create({ name: familyName, slug, createdBy: req.auth.userId });

    const membership = await Membership.create({
      familyId: family._id,
      userId: req.auth.userId,
      name: req.auth.user.name,
      role: 'admin',
      access: 'write',
      canLogin: true,
      isOwner: true,
      status: 'active',
    });

    await seedFamilyDefaults({ familyId: family._id, membershipId: membership._id });

    await logActivity(req, {
      action: 'family.create',
      targetType: 'family',
      targetId: family._id,
      familyId: family._id,
      actorName: req.auth.user.name,
    });

    res.status(201).json({
      family: serializeFamily(family),
      membership: serializeMembership(membership, { userEmail: req.auth.user.email }),
    });
  } catch (err) {
    next(err);
  }
});

// NOTE: Family documents ARE the tenant root (no `familyId` field of their own — `_id` IS the
// family id), so we deliberately do NOT run this through scopeToFamily() (which merges in a
// `{ familyId }` filter that doesn't exist on this schema and would just never match). The only
// scoping needed here is "look up exactly req.auth.familyId", which findById already gives us.

router.get('/', requireFamily, async (req, res, next) => {
  try {
    const family = await Family.findById(req.auth.familyId);
    if (!family) throw new ApiError(404, 'NOT_FOUND', 'Family not found');
    // `emailEnabled` (email module): whether SMTP is configured at all — computed from env, not
    // stored on the model. The storage driver and the upload/storage/activity limits are
    // deployment-wide and shown only on the platform admin page (GET /platform-settings).
    res.json({ ...serializeFamily(family), emailEnabled: isEmailEnabled() });
  } catch (err) {
    next(err);
  }
});

router.patch('/', requireFamily, requireAdmin, validate({ body: patchFamilySchema }), async (req, res, next) => {
  try {
    const family = await Family.findById(req.auth.familyId);
    if (!family) throw new ApiError(404, 'NOT_FOUND', 'Family not found');

    if (req.body.name !== undefined) family.name = req.body.name;
    const duration = req.body.defaultShareDuration ?? req.body.settings?.defaultShareDuration;
    if (duration !== undefined) family.settings.defaultShareDuration = duration;
    await family.save();

    await logActivity(req, {
      action: 'family.update',
      targetType: 'family',
      targetId: family._id,
      meta: { changedKeys: Object.keys(req.body) },
    });

    res.json(serializeFamily(family));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /family/test-email — admin only. Sends a test email to the CALLER (never an arbitrary
 * address) via the mailer, so an admin can confirm SMTP settings work from Settings once that
 * page exists (email module — see docs/API.md notes). Always queues (fire-and-forget) even when
 * SMTP is disabled — the mailer just logs it locally in that case — the response tells the
 * caller whether delivery was actually attempted.
 */
router.post('/test-email', requireFamily, requireAdmin, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.userId).select('name email').lean();
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');

    const email = testEmail({ name: user.name });
    const result = await sendMailNow({ to: user.email, subject: email.subject, html: email.html, text: email.text });

    await logActivity(req, { action: 'family.test_email', targetType: 'family', targetId: req.auth.familyId });

    // Real outcome (`ok` = the SMTP server accepted it). `queued`/`emailEnabled` kept for older clients.
    const body = { ok: result.ok, queued: result.ok, emailEnabled: result.error !== 'EMAIL_DISABLED', to: user.email };
    if (!result.ok) Object.assign(body, { error: result.error, code: result.code, hint: result.hint });
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
});

export default router;
