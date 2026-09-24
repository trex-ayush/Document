import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const familySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    settings: {
      // `null` on any of these three = "unset, use the server's env var default". Deliberately no
      // Mongoose schema `default` here — baking the env value in at family-creation time would
      // defeat the point (changing the env default later wouldn't affect already-created
      // families). Consuming code resolves `family.settings.X ?? env.X` — see
      // `utils/effectiveSettings.js`.
      activityRetentionDays: { type: Number, default: null },
      maxFileMB: { type: Number, default: null },
      storageLimitMB: { type: Number, default: null },
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
