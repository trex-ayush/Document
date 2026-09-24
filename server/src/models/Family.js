import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const familySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    settings: {
      activityRetentionDays: { type: Number, default: 365 },
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
