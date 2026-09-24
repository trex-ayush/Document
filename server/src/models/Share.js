import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const shareSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    targetType: { type: String, enum: ['document', 'folder', 'item'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    // Subset of a document's files to expose; empty/undefined = all files of the target.
    fileIds: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
    label: { type: String, default: '' },
    expiresAt: { type: Date, default: null }, // null = never expires
    allowDownload: { type: Boolean, default: true },
    // Sensitive custom-field / vault-item secret values are excluded from shares by default.
    // When true: enforced (by the shares module) to require `passwordHash` set AND
    // expiresAt within 24h — never "never expires". Folder shares must never set this true.
    includeSensitive: { type: Boolean, default: false },
    passwordHash: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    openCount: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
    lastOpenedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
  },
  { timestamps: true },
);

shareSchema.index({ familyId: 1, targetId: 1 });

applyIdTransform(shareSchema, { hide: ['tokenHash', 'passwordHash'] });

export const Share = mongoose.model('Share', shareSchema);
