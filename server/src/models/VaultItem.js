import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';
import { softDeletePlugin } from './plugins/softDelete.js';

// Extra "key: value" rows on a password item. `value` is stored encrypted
// (`iv.tag.ciphertext`, see utils/crypto.js); the key is plain text.
const itemFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, default: '' },
  },
  { _id: false },
);

// Two kinds only: 'login' (a saved password) and 'note' (a written note). username, password,
// field values and notes are ALL encrypted at rest; modules/items/serializer.js is the only place
// that turns a VaultItem into a response (never call `.toJSON()` on a route response).
const vaultItemSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true, index: true },
    kind: { type: String, enum: ['login', 'note'], required: true },
    title: { type: String, required: true, trim: true },
    username: { type: String, default: '' },
    password: { type: String, default: '' },
    fields: { type: [itemFieldSchema], default: [] },
    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
  },
  { timestamps: true },
);

vaultItemSchema.index({ familyId: 1, folderId: 1 });
vaultItemSchema.index({ familyId: 1, kind: 1 });

// Soft delete (docs/DECISIONS.md "Soft delete / recycle bin").
vaultItemSchema.plugin(softDeletePlugin);

applyIdTransform(vaultItemSchema);

export const VaultItem = mongoose.model('VaultItem', vaultItemSchema);
