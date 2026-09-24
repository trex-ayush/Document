import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';
import { env } from '../config/env.js';

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
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ familyId: 1, createdAt: -1 });
activitySchema.index({ familyId: 1, actorMembershipId: 1, createdAt: -1 });
activitySchema.index({ familyId: 1, action: 1, createdAt: -1 });
// TTL retention — default matches Family.settings.activityRetentionDays (365d); env override applies
// to the index definition at model-load time (a Mongoose/Mongo TTL index can't read per-family values).
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: env.ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 });

applyIdTransform(activitySchema);

export const Activity = mongoose.model('Activity', activitySchema);
