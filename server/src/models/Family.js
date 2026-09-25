import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const familySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    settings: {
      // maxFileMB / storageLimitMB / activityRetentionDays used to live here as per-family
      // overrides. They are now platform-admin-only (models/PlatformSettings.js) and were removed
      // from this schema; an old value may still exist in the raw DB document but is never read
      // (utils/effectiveSettings.js) nor returned (modules/auth/serializers.js#serializeFamily).
      // Require a fresh password re-entry (POST /auth/reauth -> X-Reauth header, 5 min TTL)
      // before a sensitive value (vault item secret, sensitive custom field) can be revealed.
      // Admins may turn this off for their family.
      requireReauthForSecrets: { type: Boolean, default: true },
    },
    storageBytes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

applyIdTransform(familySchema);

export const Family = mongoose.model('Family', familySchema);
