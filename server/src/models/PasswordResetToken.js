import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

// Backs both "forgot password" resets and member invites (same capability-token shape, just a
// different `purpose` + expiry policy) — see docs/DECISIONS.md-style note in this agent's final
// report. The raw token is a `generateOpaqueToken()` value (utils/crypto.js) that only ever
// appears in the email link (`${CLIENT_URL}/reset-password?token=...` or
// `/accept-invite?token=...`) — only its SHA-256 hash is ever persisted, same pattern as
// RefreshToken/Share tokens.
const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    purpose: { type: String, enum: ['reset', 'invite'], required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// TTL cleanup well after expiry (grace period for debugging/support), same pattern as
// RefreshToken — the actual "is this still valid" check is always the explicit
// expiresAt/usedAt comparison in service code, never reliance on the TTL sweep's timing.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

applyIdTransform(passwordResetTokenSchema, { hide: ['tokenHash'] });

export const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
