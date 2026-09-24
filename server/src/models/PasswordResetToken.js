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
    // Multi-family (docs/DECISIONS.md "Multi-family accounts"): a `purpose: 'reset'` token is
    // always tied to a real, existing User (`userId`). A `purpose: 'invite'` token is tied to a
    // specific `Membership` instead (`membershipId`) — NEVER just `userId` — because under
    // multi-family a single user can hold several memberships (including several simultaneous
    // pending invites), so "the membership this token names" must be unambiguous; `userId` alone
    // can't disambiguate which family/membership a token is for. Exactly one of the two is set,
    // enforced by the pre-validate hook below.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    membershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    purpose: { type: String, enum: ['reset', 'invite'], required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

passwordResetTokenSchema.pre('validate', function requireOneSubject(next) {
  if (!this.userId && !this.membershipId) {
    next(new Error('PasswordResetToken requires either userId or membershipId'));
    return;
  }
  next();
});

// TTL cleanup well after expiry (grace period for debugging/support), same pattern as
// RefreshToken — the actual "is this still valid" check is always the explicit
// expiresAt/usedAt comparison in service code, never reliance on the TTL sweep's timing.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

applyIdTransform(passwordResetTokenSchema, { hide: ['tokenHash'] });

export const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
