import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

// Deployment-wide settings — ONE document for the whole instance (not per-family). Fixed id so
// there's always exactly one row; `getPlatformSettings()` creates it with defaults on first read.
const SINGLETON_ID = 'platform';

const platformSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    // Which sign-in methods the WHOLE deployment accepts, for every family/user. Not a per-family
    // policy — see docs/DECISIONS.md "Platform settings". Editable only by whoever is logged in
    // as PLATFORM_OWNER_EMAIL (env) — there's no platform-super-admin role in the data model.
    allowedLoginMethods: { type: String, enum: ['google', 'password', 'both'], default: 'both' },
    // Deployment-wide SMTP override. Same "null = unset, fall back to the matching env.SMTP_*
    // var" convention as Family.settings.* (see utils/effectiveSettings.js) — deliberately no
    // Mongoose `default` baking in the env value, so changing the env default later still takes
    // effect for a family/deployment that never overrode it. Resolved DB-then-env by
    // services/mailer.js#getEffectiveSmtpConfig(). The password is never stored in plaintext —
    // `passEncrypted` holds `encryptFieldValue()` ciphertext (utils/crypto.js, the same
    // AES-256-GCM field encryption used for sensitive custom-field values) and is never sent in
    // any API response (see modules/platform/routes.js's serializer).
    smtp: {
      host: { type: String, default: null },
      port: { type: Number, default: null },
      secure: { type: Boolean, default: null },
      user: { type: String, default: null },
      mailFrom: { type: String, default: null },
      passEncrypted: { type: String, default: null },
    },
  },
  { timestamps: true },
);

applyIdTransform(platformSettingsSchema, { hide: ['smtp.passEncrypted'] });

export const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);

/** Always returns a row (creates the default singleton on first call if none exists yet). */
export async function getPlatformSettings() {
  const existing = await PlatformSettings.findById(SINGLETON_ID).lean();
  if (existing) return existing;
  const created = await PlatformSettings.create({ _id: SINGLETON_ID });
  return created.toObject();
}
