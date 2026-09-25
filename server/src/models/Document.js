import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';
import { softDeletePlugin } from './plugins/softDelete.js';

const customFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    // Plaintext for non-sensitive fields; `iv.tag.ciphertext` (see utils/crypto.js) when sensitive:true.
    value: { type: String, default: '' },
    type: { type: String, enum: ['text', 'number', 'date', 'email', 'phone', 'url'], default: 'text' },
    sensitive: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: false },
);

const fileEncryptionSchema = new mongoose.Schema(
  {
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    wrappedKey: { type: String, required: true },
    keyIv: { type: String, required: true },
    keyTag: { type: String, required: true },
  },
  { _id: false },
);

const fileSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    order: { type: Number, default: 0 },
    // Storage adapter key for the encrypted original, and for its webp thumbnail (images only).
    storageKey: { type: String, required: true },
    thumbKey: { type: String, default: null },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    encryption: { type: fileEncryptionSchema, required: true },
    thumbEncryption: { type: fileEncryptionSchema, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

const documentSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true, index: true },
    title: { type: String, required: true, trim: true },
    typeId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentType', default: null },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
    tags: { type: [String], default: [] },
    notes: { type: String, default: '' },
    expiryDate: { type: Date, default: null },
    customFields: { type: [customFieldSchema], default: [] },
    files: { type: [fileSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
    lastViewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

documentSchema.index({ familyId: 1, folderId: 1 });
documentSchema.index({ familyId: 1, memberId: 1 });
documentSchema.index({ familyId: 1, typeId: 1 });
documentSchema.index({ familyId: 1, expiryDate: 1 });
documentSchema.index(
  { title: 'text', tags: 'text', notes: 'text', 'customFields.key': 'text', 'customFields.value': 'text' },
  { name: 'document_search', weights: { title: 5, tags: 3, 'customFields.key': 2, notes: 1, 'customFields.value': 1 } },
);

// applyIdTransform's `hide` only supports flat/dotted single-value paths, not per-array-element
// stripping — so raw storageKey/thumbKey/encryption on `files[]` are NOT auto-hidden here.
// The documents module's own response serializer MUST rebuild each file as
// { id, label, order, originalName, mimeType, size, width, height, url, thumbUrl, downloadUrl }
// (never storageKey/thumbKey/encryption) before sending any Document to a client. Never call
// `doc.toJSON()` directly on a route response — always go through that serializer.
// Soft delete (docs/DECISIONS.md "Soft delete / recycle bin") — adds deletedAt/deletedBy and
// excludes soft-deleted rows from every normal query by default. Must be applied AFTER the
// indexes/text-index above but BEFORE applyIdTransform (order doesn't actually matter between
// those two, just documenting that this is deliberate, not incidental, placement).
documentSchema.plugin(softDeletePlugin);

applyIdTransform(documentSchema);

export const Document = mongoose.model('Document', documentSchema);
