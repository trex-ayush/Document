import mongoose from 'mongoose';
import { applyIdTransform } from '../utils/mongooseJson.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    // Optional: a Google-only user has no password. `authProviders` says which sign-in methods
    // are actually usable for this account; a user can have both.
    passwordHash: { type: String, default: null },
    // NOTE: no `default: null` here on purpose — `sparse` only excludes documents where the
    // field is *absent*. Giving every non-Google user an explicit `null` would make them all
    // collide on the sparse unique index (E11000 on the second such user). Leave it genuinely
    // unset until a Google account is linked.
    googleId: { type: String, unique: true, sparse: true },
    avatarUrl: { type: String, default: null },
    authProviders: { type: [String], enum: ['password', 'google'], default: ['password'] },
    avatarColor: { type: String, default: '#FF5A5F' },
    // The UI language the user picked ('en' | 'hi'); null until they pick one. Applied on every
    // sign-in so a new phone opens in the same language.
    language: { type: String, enum: ['en', 'hi', null], default: null },
    lastLoginAt: { type: Date, default: null },
    disabled: { type: Boolean, default: false },
    // "Log out everywhere" moment: any access token issued before this is rejected at once
    // (middleware/auth.js), so a sign-out doesn't wait for the 15-minute access token to expire.
    sessionsRevokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

applyIdTransform(userSchema, { hide: ['passwordHash'] });

export const User = mongoose.model('User', userSchema);
