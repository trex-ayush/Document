import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

// One row per (family, person) — a person may be a real logged-in User (canLogin: true) or a
// profile-only tag (canLogin: false, userId: null) used to attribute documents to e.g. a child
// or grandparent who never logs in. Kept as its own collection (not embedded on User) so a
// future "one user, many families" model is a schema-compatible addition.
const membershipSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // Multi-family invites (docs/DECISIONS.md "Multi-family accounts"): when an admin invites an
    // email with no existing User account, the Membership is created directly with `userId: null`,
    // `invitedEmail: <email>`, `status: 'invited'` — no User row is pre-created. Auto-join
    // (auth/service.js#autoJoinPendingInvites) links `userId` + flips to 'active' the moment
    // someone signs up/logs in/completes Google with this exact email. Cleared back to `null` once
    // linked (kept meaningful only while `userId` is null) — see autoJoinPendingInvites.
    invitedEmail: { type: String, lowercase: true, trim: true, default: null, index: true },
    // The `loginMethod` an admin picked at invite time (POST /members), kept only for the
    // decoupled case above (`userId: null`) so GET /auth/accept-invite/:token can still answer
    // `allowsGoogle` before any User row exists to read `authProviders` off of. Meaningless (left
    // null) once linked or for a non-invite membership.
    invitedLoginMethod: { type: String, enum: ['password', 'google', 'both'], default: null },
    name: { type: String, required: true, trim: true },
    relation: { type: String, default: '', trim: true },
    dob: { type: Date, default: null },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    access: { type: String, enum: ['read', 'write'], default: 'read' },
    canLogin: { type: Boolean, default: true },
    isOwner: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'disabled', 'invited'], default: 'active' },
    // Email module: per-admin INSTANT alert preferences (member added, share created, etc. — see
    // server/src/services/alerts.js). Meaningless for non-admin memberships (only admins receive
    // alert emails), but kept on every membership rather than a separate collection since it's
    // small and 1:1 with the membership either way. No digest preference — the digest-email
    // feature was dropped (Dashboard + Activity Log already cover "what happened" on demand).
    notificationPrefs: {
      instant: { type: mongoose.Schema.Types.Mixed, default: {} }, // { [eventKey]: boolean }
    },
  },
  { timestamps: true },
);

membershipSchema.index({ familyId: 1, userId: 1 });

applyIdTransform(membershipSchema);

export const Membership = mongoose.model('Membership', membershipSchema);
