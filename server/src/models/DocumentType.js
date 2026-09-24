import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const fieldDefSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    type: { type: String, enum: ['text', 'number', 'date', 'email', 'phone', 'url'], default: 'text' },
    sensitive: { type: Boolean, default: false },
  },
  { _id: false },
);

const documentTypeSchema = new mongoose.Schema(
  {
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
    name: { type: String, required: true, trim: true },
    icon: { type: String, default: 'file' },
    defaultFolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    fields: { type: [fieldDefSchema], default: [] },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

documentTypeSchema.index({ familyId: 1, name: 1 });

applyIdTransform(documentTypeSchema);

export const DocumentType = mongoose.model('DocumentType', documentTypeSchema);
