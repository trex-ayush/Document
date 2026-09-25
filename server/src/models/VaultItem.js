import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';
import { softDeletePlugin } from './plugins/softDelete.js';

// Same shape as Document.customFields (models/Document.js) — reused rather than duplicated per
// docs/DECISIONS.md "Items module": plaintext for non-sensitive fields, `iv.tag.ciphertext` (see
// utils/crypto.js) when sensitive:true. A login's password, a record's ID number, and a secure
// note's body are all just one more field in this same array — the `kind` only steers which
// fields the client offers/labels by default, never a schema difference server-side.
const itemFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, default: '' },
    type: { type: String, enum: ['text', 'number', 'date', 'email', 'phone', 'url'], default: 'text' },
    sensitive: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: false },
);

const vaultItemSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true, index: true },
    kind: { type: String, enum: ['login', 'record', 'note'], required: true },
    title: { type: String, required: true, trim: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
    tags: { type: [String], default: [] },
    fields: { type: [itemFieldSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
  },
  { timestamps: true },
);

vaultItemSchema.index({ familyId: 1, folderId: 1 });
vaultItemSchema.index({ familyId: 1, kind: 1 });
vaultItemSchema.index({ familyId: 1, memberId: 1 });
vaultItemSchema.index(
  { title: 'text', tags: 'text', 'fields.key': 'text', 'fields.value': 'text' },
  { name: 'item_search', weights: { title: 5, tags: 3, 'fields.key': 2, 'fields.value': 1 } },
);

// Soft delete (docs/DECISIONS.md "Soft delete / recycle bin").
vaultItemSchema.plugin(softDeletePlugin);

// Same caveat as models/Document.js: this module's own serializer MUST rebuild `fields[]` (never
// raw ciphertext) before a VaultItem reaches a client. Never call `.toJSON()` directly on a route
// response — always go through modules/items/serializer.js.
applyIdTransform(vaultItemSchema);

export const VaultItem = mongoose.model('VaultItem', vaultItemSchema);
