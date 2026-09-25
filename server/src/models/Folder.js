import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';
import { softDeletePlugin } from './plugins/softDelete.js';

// A folder is just a name in a tree. Every family has exactly ONE system folder — "Shared"
// (`isSystem: true, systemKey: 'shared'`), created with the family (seed/seedFamilyDefaults.js)
// and protected from rename/move/delete (modules/folders/routes.js). Anything added without a
// folder lands there, so the top level only ever holds folders.
const folderSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    name: { type: String, required: true, trim: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
    isSystem: { type: Boolean, default: false },
    systemKey: { type: String, enum: ['shared', null], default: null },
    // The system folder is created by the app, not a member — so createdBy is only required for
    // folders people make themselves.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Membership',
      default: null,
      required() {
        return !this.isSystem;
      },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
  },
  { timestamps: true },
);

folderSchema.index({ familyId: 1, parentId: 1, name: 1 });
// At most one system folder per key per family (race-safe lazy creation relies on this).
folderSchema.index(
  { familyId: 1, systemKey: 1 },
  { unique: true, partialFilterExpression: { systemKey: { $type: 'string' } } },
);

// Soft delete (docs/DECISIONS.md "Soft delete / recycle bin").
folderSchema.plugin(softDeletePlugin);

applyIdTransform(folderSchema);

export const Folder = mongoose.model('Folder', folderSchema);
