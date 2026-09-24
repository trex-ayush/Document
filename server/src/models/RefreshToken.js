import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'RefreshToken', default: null },
    userAgent: { type: String, default: '' },
    ipHash: { type: String, default: null },
  },
  { timestamps: true },
);

// TTL cleanup well after expiry (grace period for debugging); rotation/revocation logic is explicit.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

applyIdTransform(refreshTokenSchema, { hide: ['tokenHash'] });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
