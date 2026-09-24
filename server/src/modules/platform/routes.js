import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';
import { User } from '../../models/User.js';
import { verifyAccessToken } from '../../utils/tokens.js';
import { encryptFieldValue } from '../../utils/crypto.js';
import { invalidateSmtpCache } from '../../services/mailer.js';
import { PlatformSettings, getPlatformSettings } from '../../models/PlatformSettings.js';

// Deployment-wide settings — NOT per-family. See docs/DECISIONS.md "Platform settings" and
// models/PlatformSettings.js. GET is public (the login/signup page needs it pre-auth to decide
// which sign-in buttons to show, and it also needs to work for a logged-out visitor); PATCH is
// gated to whoever is logged in as PLATFORM_OWNER_EMAIL — there's no platform-super-admin role in
// this app, so identity is env-configured. Both routes share the same ownership check
// (`isPlatformOwner` below) rather than duplicating the comparison.
const router = express.Router();

/** Same check GET and PATCH both use — one comparison, not two copies that could drift. */
function isPlatformOwner(user) {
  return Boolean(env.PLATFORM_OWNER_EMAIL) && user?.email === env.PLATFORM_OWNER_EMAIL;
}

/**
 * Shapes the stored singleton into the wire response. `smtp.passEncrypted` NEVER appears here —
 * only `hasPassword` (whether one is currently set), so the client can show a masked placeholder
 * without ever seeing ciphertext, let alone plaintext. The other smtp.* fields are the RAW stored
 * value (`null` when unset), same convention as `GET /family`'s settings — NOT the resolved
 * DB-or-env "effective" value, so the admin's form can tell "explicitly set" apart from "using
 * the deployment default" (see client's placeholder-hint pattern, e.g. SettingsSystem.jsx).
 */
function serializePlatformSettings(settings) {
  const smtp = settings.smtp || {};
  return {
    allowedLoginMethods: settings.allowedLoginMethods,
    smtp: {
      host: smtp.host ?? null,
      port: smtp.port ?? null,
      secure: smtp.secure ?? null,
      user: smtp.user ?? null,
      mailFrom: smtp.mailFrom ?? null,
      hasPassword: Boolean(smtp.passEncrypted),
    },
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
        const user = await User.findById(payload.sub).select('email').lean();
        if (user) {
          body.isPlatformOwner = isPlatformOwner(user);
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
// Family.settings.* (docs/DECISIONS.md "Operational settings"). `pass` specifically: omitted =
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
    pass: z.string().min(1).nullable().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    allowedLoginMethods: z.enum(['google', 'password', 'both']).optional(),
    smtp: smtpPatchSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

/** PATCH /platform-settings — only the configured platform owner (by email) may write. */
router.patch('/', requireAuth, validate({ body: patchSchema }), async (req, res, next) => {
  try {
    if (!isPlatformOwner(req.auth.user)) {
      throw new ApiError(403, 'FORBIDDEN', 'Not the platform owner');
    }

    const set = {};

    if (req.body.allowedLoginMethods !== undefined) {
      set.allowedLoginMethods = req.body.allowedLoginMethods;
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

    res.json(serializePlatformSettings(updated));
  } catch (err) {
    next(err);
  }
});

export default router;
