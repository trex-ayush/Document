import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

// Admin-panel admins (docs/ADMIN_API.md "Roles"). Whoever logs in with one of these emails is an
// admin. The super admin (env SUPER_ADMIN_EMAIL / PLATFORM_OWNER_EMAIL) is NEVER stored here, so
// it can't be removed through the app.
const platformAdminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

applyIdTransform(platformAdminSchema);

export const PlatformAdmin = mongoose.model('PlatformAdmin', platformAdminSchema);
