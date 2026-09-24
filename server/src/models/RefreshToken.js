import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Multi-family (docs/DECISIONS.md "Multi-family accounts"): a refresh token is now purely
    // user-scoped — "which family" is resolved per-request from the X-Family-Id header, never
    // baked into any token (see middleware/auth.js). `familyId` is kept (rather than removed) only
    // for backward-compatible reads of pre-existing rows; every row written from here on leaves it
    // `null`. Loosened from `required: true` specifically so a brand-new user with zero
    // memberships yet (a "cold" signup, before `POST /family` is ever called — see docs/API.md
    // "Multi-family sessions") can still be issued a valid session, exactly as
    // POST /auth/signup's documented response shape requires (`accessToken`+`refreshToken` are
    // always present, even when `memberships: []`). Nothing else in the codebase reads this field
    // (verified: only server/src/modules/auth/tokenService.js ever did, and it no longer needs to).
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', default: null, index: true },
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
