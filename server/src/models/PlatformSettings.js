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
  },
  { timestamps: true },
);

applyIdTransform(platformSettingsSchema);

export const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);

/** Always returns a row (creates the default singleton on first call if none exists yet). */
export async function getPlatformSettings() {
  const existing = await PlatformSettings.findById(SINGLETON_ID).lean();
  if (existing) return existing;
  const created = await PlatformSettings.create({ _id: SINGLETON_ID });
  return created.toObject();
}
