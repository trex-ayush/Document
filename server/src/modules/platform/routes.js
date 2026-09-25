import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { env } from '../../config/env.js';
import { User } from '../../models/User.js';
import { verifyAccessToken } from '../../utils/tokens.js';
import { encryptFieldValue } from '../../utils/crypto.js';
import { invalidateSmtpCache } from '../../services/mailer.js';
import { PlatformSettings, getPlatformSettings } from '../../models/PlatformSettings.js';
import { logActivity } from '../../services/activityLogger.js';
import { listBinEntriesAllFamilies, permanentlyPurgeOne, findBinEntryFamilyId } from '../bin/lib.js';
import { getPlatformRole, requireSuperAdmin } from '../../services/platformRoles.js';

// Deployment-wide settings — NOT per-family. See docs/DECISIONS.md "Platform settings" and
// models/PlatformSettings.js. GET is public (the login/signup page needs it pre-auth to decide
// which sign-in buttons to show, and it also needs to work for a logged-out visitor); PATCH and
// the cross-family bin are super admin only (docs/ADMIN_API.md "Roles"). Who is the super admin /
// an admin is decided in one place: services/platformRoles.js.
const router = express.Router();

/**
 * Shapes the stored singleton into the wire response. `smtp.passEncrypted` NEVER appears here —
 * only `hasPassword` (whether one is currently set), so the client can show a masked placeholder
 * without ever seeing ciphertext, let alone plaintext. The other smtp.* fields are the RAW stored
 * value (`null` when unset), same convention as `GET /family`'s settings — NOT the resolved
 * DB-or-env "effective" value, so the admin's form can tell "explicitly set" apart from "using
 * the deployment default" (see the placeholder-hint pattern in client PlatformSettings.jsx).
 */
function serializePlatformSettings(settings) {
  const smtp = settings.smtp || {};
  return {
    allowedLoginMethods: settings.allowedLoginMethods,
    activityRetentionDays: settings.activityRetentionDays ?? null,
    maxFileMB: settings.maxFileMB ?? null,
    storageLimitMB: settings.storageLimitMB ?? null,
    binRetentionDays: settings.binRetentionDays ?? null,
    smtp: {
      host: smtp.host ?? null,
      port: smtp.port ?? null,
      secure: smtp.secure ?? null,
      user: smtp.user ?? null,
      mailFrom: smtp.mailFrom ?? null,
      replyTo: smtp.replyTo ?? null,
      hasPassword: Boolean(smtp.passEncrypted),
    },
  };
}

/**
 * Owner-only extras: the env fallback each blank limit resolves to (so the admin form can say
 * "Using default: 20 MB" instead of a vague hint) and the read-only storage driver. Deployment
 * details like these are only ever added for the platform owner — never on the anonymous/public
 * GET the login page makes.
 */
function ownerExtras() {
  return {
    defaults: {
      activityRetentionDays: env.ACTIVITY_RETENTION_DAYS,
      maxFileMB: env.MAX_FILE_MB,
      storageLimitMB: env.STORAGE_LIMIT_MB,
    },
    storageDriver: env.STORAGE_DRIVER,
  };
}

/**
 * GET /platform-settings — public, no auth REQUIRED. If a valid `Authorization: Bearer` header
 * is present anyway, we resolve the caller and include `isPlatformOwner` so the client can decide
 * (e.g. whether to show a nav link to this page) without a second mechanism — same
 * `isPlatformOwner()` check `PATCH` enforces for real. Omitted entirely for an anonymous caller
 * (no token) rather than sent as `false`, which would be meaningless for someone not logged in.
 * An invalid/expired token on this public route is treated the same as no token — never errors.
 */
router.get('/', async (req, res, next) => {
  try {
    const settings = await getPlatformSettings();
    const body = serializePlatformSettings(settings);

    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme === 'Bearer' && token) {
      try {
        const payload = verifyAccessToken(token);
        const user = await User.findById(payload.sub).select('email disabled').lean();
        if (user) {
          const role = await getPlatformRole(user);
          // `isPlatformOwner` = super admin, kept for backward compatibility.
          body.isPlatformOwner = role === 'super';
          body.platformRole = role;
          body.isPlatformAdmin = Boolean(role);
          // Admins see the settings page read-only, so they get the same non-secret extras.
          if (role) Object.assign(body, ownerExtras());
        }
      } catch {
        // Invalid/expired token on a public route — treat as anonymous, don't fail the request.
      }
    }

    res.json(body);
  } catch (err) {
    next(err);
  }
});

// `null` on any smtp.* field = "unset, fall back to env.SMTP_*" — same convention as
// the operational limits above (docs/DECISIONS.md "Operational settings"). `pass` specifically: omitted =
// keep the existing encrypted password untouched, `null` = clear it, a non-empty string = the new
// password (encrypted before it's stored — see the handler below). Min-length-1 on the string
// fields rather than allowing `""` keeps "clear this" (`null`) and "leave it alone" (omit)
// unambiguous — the client only ever sends a field when the admin actually changed it.
const smtpPatchSchema = z
  .object({
    host: z.string().trim().min(1).nullable().optional(),
    port: z.coerce.number().int().positive().nullable().optional(),
    secure: z.boolean().nullable().optional(),
    user: z.string().trim().min(1).nullable().optional(),
    mailFrom: z.string().trim().min(1).nullable().optional(),
    // A plain address or "Name <address>"; only needs to look like it contains an email.
    replyTo: z
      .string()
      .trim()
      .regex(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/, 'Enter a valid email address')
      .nullable()
      .optional(),
    pass: z.string().min(1).nullable().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    allowedLoginMethods: z.enum(['google', 'password', 'both']).optional(),
    // The three operational limits — platform-admin-only (no per-family override exists). `null`
    // clears one back to its env fallback (ACTIVITY_RETENTION_DAYS / MAX_FILE_MB /
    // STORAGE_LIMIT_MB). Resolved by utils/effectiveSettings.js.
    activityRetentionDays: z.coerce.number().int().min(30).max(3650).nullable().optional(),
    maxFileMB: z.coerce.number().int().min(1).max(200).nullable().optional(),
    storageLimitMB: z.coerce.number().int().min(100).nullable().optional(),
    // Informational only — see models/PlatformSettings.js's own comment. Never drives an
    // automatic purge; same bounds as activityRetentionDays for consistency, not because they're
    // functionally related.
    binRetentionDays: z.coerce.number().int().min(30).max(3650).nullable().optional(),
    smtp: smtpPatchSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

/** PATCH /platform-settings — only the configured platform owner (by email) may write. */
// Body validation runs before the role check, same order as before (a malformed body is a 400
// for everyone).
router.patch('/', requireAuth, validate({ body: patchSchema }), requireSuperAdmin, async (req, res, next) => {
  try {
    const set = {};

    if (req.body.allowedLoginMethods !== undefined) {
      set.allowedLoginMethods = req.body.allowedLoginMethods;
    }

    for (const key of ['activityRetentionDays', 'maxFileMB', 'storageLimitMB']) {
      if (req.body[key] !== undefined) set[key] = req.body[key];
    }

    if (req.body.binRetentionDays !== undefined) {
      set.binRetentionDays = req.body.binRetentionDays;
    }

    if (req.body.smtp !== undefined) {
      const { pass, ...rest } = req.body.smtp;
      for (const [key, value] of Object.entries(rest)) {
        // `value` is either a real value or explicit `null` (clear) — zod already stripped
        // `undefined`/omitted keys out of `req.body.smtp`, so anything present here is a change.
        set[`smtp.${key}`] = value;
      }
      if (pass !== undefined) {
        // `pass: null` clears it (falls back to env.SMTP_PASS); a non-empty string (zod already
        // rejects `""`) is encrypted and becomes the new stored value. Omitted `pass` entirely
        // (not in `rest`/handled above) leaves `smtp.passEncrypted` untouched.
        set['smtp.passEncrypted'] = pass === null ? null : encryptFieldValue(pass);
      }
    }

    const updated = await PlatformSettings.findByIdAndUpdate(
      'platform',
      Object.keys(set).length ? { $set: set } : {},
      { new: true, upsert: true },
    ).lean();

    // Reflect an SMTP change immediately in isEmailEnabled()'s callers (GET /family, POST
    // /members' sendInvite default) instead of waiting out its short cache TTL.
    if (req.body.smtp !== undefined) {
      invalidateSmtpCache();
    }

    // The caller is the owner (checked above), so include the same owner-only extras GET adds.
    res.json({ ...serializePlatformSettings(updated), ...ownerExtras() });
  } catch (err) {
    next(err);
  }
});

const purgeBodySchema = z
  .object({
    items: z
      .array(z.object({ type: z.enum(['document', 'folder', 'item', 'file']), id: z.string().regex(/^[0-9a-fA-F]{24}$/) }))
      .min(1),
  })
  .strict();

/**
 * GET /platform-settings/bin — the bin ACROSS EVERY FAMILY on this deployment, owner-only. This
 * is deliberately a separate, more powerful view than a family's own `GET /bin`
 * (modules/bin/routes.js) — see docs/DECISIONS.md "Soft delete / recycle bin" for why cross-
 * family visibility only ever belongs here, gated the same way as every other platform-owner
 * action on this router.
 */
router.get('/bin', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const items = await listBinEntriesAllFamilies();
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /platform-settings/bin/purge — owner-only. Body: `{ items: [{ type, id }] }`. THE only
 * route in the app that permanently removes a document/folder/item and its files — see
 * modules/bin/lib.js#permanentlyPurgeOne for exactly what that does per type. Each entry is
 * purged independently; one bad id doesn't abort the rest, but its error is reported back so the
 * admin knows it didn't silently succeed.
 */
router.post('/bin/purge', requireAuth, validate({ body: purgeBodySchema }), requireSuperAdmin, async (req, res, next) => {
  try {
    const results = [];
    for (const { type, id } of req.body.items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const entry = await findBinEntryFamilyId(type, id);
        // eslint-disable-next-line no-await-in-loop
        await permanentlyPurgeOne(entry.familyId, type, id);
        // eslint-disable-next-line no-await-in-loop
        await logActivity(
          { auth: null },
          {
            action: 'bin.purge',
            targetType: type,
            targetId: id,
            familyId: entry.familyId,
            actorName: 'Platform admin',
            meta: { name: entry.name },
          },
        );
        results.push({ type, id, purged: true });
      } catch (err) {
        results.push({ type, id, purged: false, error: err.code || err.message });
      }
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;
