import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

/** Share link durations a family (and each sharer) can choose from. */
export const SHARE_DURATIONS = ['12h', '24h', '7d'];

const familySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    settings: {
      // Operational limits (max file size, storage, activity retention) are platform-wide — see
      // models/PlatformSettings.js and utils/effectiveSettings.js. Only family choices live here.
      // How long a new share link lasts when the sharer doesn't pick a duration.
      defaultShareDuration: { type: String, enum: SHARE_DURATIONS, default: '12h' },
    },
    storageBytes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

applyIdTransform(familySchema);

export const Family = mongoose.model('Family', familySchema);
