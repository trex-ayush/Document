import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';
import { SHARE_DURATIONS } from './Family.js';

/**
 * A public, no-login link to one document (optionally just some of its files) or one folder
 * (with everything inside it, at any depth). The public page only ever shows titles and files —
 * never notes, passwords or note items. Links always expire (see SHARE_DURATIONS).
 */
const shareSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    targetType: { type: String, enum: ['document', 'folder'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    // Subset of a document's files to expose (single-file share); empty/undefined = all files.
    fileIds: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
    duration: { type: String, enum: SHARE_DURATIONS, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    openCount: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
    lastOpenedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
  },
  { timestamps: true },
);

shareSchema.index({ familyId: 1, targetId: 1 });

applyIdTransform(shareSchema, { hide: ['tokenHash'] });

export const Share = mongoose.model('Share', shareSchema);
