import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';
import { softDeletePlugin } from './plugins/softDelete.js';

const folderSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    name: { type: String, required: true, trim: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
    color: { type: String, default: '#FF5A5F' },
    icon: { type: String, default: '📁' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
  },
  { timestamps: true },
);

folderSchema.index({ familyId: 1, parentId: 1, name: 1 });

// Soft delete (docs/DECISIONS.md "Soft delete / recycle bin").
folderSchema.plugin(softDeletePlugin);

applyIdTransform(folderSchema);

export const Folder = mongoose.model('Folder', folderSchema);
