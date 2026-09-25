import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';
import { softDeletePlugin } from './plugins/softDelete.js';

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
    // Per-file Bin (docs/DECISIONS.md "Soft delete / recycle bin"): deleting one file only sets
    // these; the stored blob/thumbnail stay untouched until the platform admin purges the file
    // (modules/bin/lib.js#permanentlyPurgeOne, type 'file'). Legacy subdocs have no field at all,
    // which counts as active. Anything that shows, counts, zips, shares or serves a document's
    // files MUST go through `activeFiles(doc)` below.
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
  },
  { timestamps: false },
);

/** A document's files that are NOT in the Bin (works on lean and hydrated docs). */
export function activeFiles(doc) {
  return (doc?.files || []).filter((f) => !f.deletedAt);
}

const documentSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    // Always set — a document added without a folder goes into the family's Shared folder.
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true, index: true },
    title: { type: String, required: true, trim: true },
    // Encrypted at rest (utils/crypto.js encryptFieldValue) — '' when empty. Decrypted only by
    // modules/documents/serializer.js.
    notes: { type: String, default: '' },
    files: { type: [fileSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
    lastViewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

documentSchema.index({ familyId: 1, folderId: 1 });

// applyIdTransform's `hide` only supports flat/dotted single-value paths, not per-array-element
// stripping — so raw storageKey/thumbKey/encryption on `files[]` are NOT auto-hidden here.
// The documents module's own response serializer MUST rebuild each file as
// { id, label, order, originalName, mimeType, size, width, height, url, thumbUrl, downloadUrl }
// (never storageKey/thumbKey/encryption) before sending any Document to a client. Never call
// `doc.toJSON()` directly on a route response — always go through that serializer.
// Soft delete (docs/DECISIONS.md "Soft delete / recycle bin") — adds deletedAt/deletedBy and
// excludes soft-deleted rows from every normal query by default.
documentSchema.plugin(softDeletePlugin);

applyIdTransform(documentSchema);

export const Document = mongoose.model('Document', documentSchema);
