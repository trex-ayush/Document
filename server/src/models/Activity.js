import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const activitySchema = new mongoose.Schema(
  {
    // null ONLY for platform-level admin-panel actions (`admin.user.*`, `admin.admin.*` — see
    // modules/admin/audit.js), which belong to no family. Every family feed filters by familyId,
    // so those rows never show up there. logActivity() still refuses to write without one.
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', default: null, index: true },
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
    // Computed at write time from the *current* activity retention setting (platform admin's
    // `PlatformSettings.activityRetentionDays` -> env — see `services/activityLogger.js` +
    // `utils/effectiveSettings.js`), so the platform admin can change retention at runtime without
    // rebuilding a TTL index. `expireAfterSeconds: 0` on a Date field means "expire at the value
    // stored in this field". Changing the retention setting only affects activity logged AFTER the
    // change — existing rows keep whichever `expiresAt` they were written with, which is expected (not a bug to fix).
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ familyId: 1, createdAt: -1 });
activitySchema.index({ familyId: 1, actorMembershipId: 1, createdAt: -1 });
activitySchema.index({ familyId: 1, action: 1, createdAt: -1 });
// Cross-family admin feed (GET /api/admin/activity) sorts by time without a family filter.
activitySchema.index({ createdAt: -1 });
activitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

applyIdTransform(activitySchema);

export const Activity = mongoose.model('Activity', activitySchema);
