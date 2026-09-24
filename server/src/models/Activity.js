import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const activitySchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    // null = public visitor (a /public/shares/:token open, e.g.)
    actorMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
    actorName: { type: String, default: 'Visitor' },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: null },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null, index: true },
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    shareId: { type: mongoose.Schema.Types.ObjectId, ref: 'Share', default: null },
    // Free-form, e.g. { changedKeys: ['PAN Number'] } — NEVER put a sensitive field's value here.
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipHash: { type: String, default: null },
    userAgent: { type: String, default: '' },
    // Computed at write time from the family's *current* `settings.activityRetentionDays` (see
    // `services/activityLogger.js` + `utils/effectiveSettings.js`) — a plain
    // `expireAfterSeconds: N` TTL index applies ONE fixed value to the whole collection, which
    // can't vary per family. `expireAfterSeconds: 0` on a Date field instead means "expire at the
    // value stored in this field", which is the standard trick for per-tenant TTL. Changing a
    // family's retention setting only affects activity logged AFTER the change — existing rows
    // keep whichever `expiresAt` they were written with, which is expected (not a bug to fix).
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ familyId: 1, createdAt: -1 });
activitySchema.index({ familyId: 1, actorMembershipId: 1, createdAt: -1 });
activitySchema.index({ familyId: 1, action: 1, createdAt: -1 });
activitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

applyIdTransform(activitySchema);

export const Activity = mongoose.model('Activity', activitySchema);
