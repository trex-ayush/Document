import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    avatarColor: { type: String, default: '#FF5A5F' },
    lastLoginAt: { type: Date, default: null },
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

applyIdTransform(userSchema, { hide: ['passwordHash'] });

export const User = mongoose.model('User', userSchema);
