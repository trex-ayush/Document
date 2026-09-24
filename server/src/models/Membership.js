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
    name: { type: String, required: true, trim: true },
    relation: { type: String, default: '', trim: true },
    dob: { type: Date, default: null },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    access: { type: String, enum: ['read', 'write'], default: 'read' },
    canLogin: { type: Boolean, default: true },
    isOwner: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  },
  { timestamps: true },
);

membershipSchema.index({ familyId: 1, userId: 1 });

applyIdTransform(membershipSchema);

export const Membership = mongoose.model('Membership', membershipSchema);
