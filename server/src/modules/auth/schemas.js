import { z } from 'zod';

// Kept deliberately simple (length only) — docs/API.md doesn't specify a complexity policy and
// over-constraining here would just be friction for every other module/test that signs up a
// user. Normalization (trim + lowercase) for email happens in service.js right before every
// User lookup/write, not here, to keep this schema resilient to zod version differences around
// chained string transforms.
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);
const emailSchema = z.string().trim().min(1).email('Invalid email address');

// Multi-family (docs/DECISIONS.md "Multi-family accounts"): signup creates ONLY the User —
// `familyName` is gone (that's POST /family now, called separately once the client knows
// whether auto-join already gave this user a family or not).
export const signupSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(100),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'password is required'),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1, 'refreshToken is required'),
  })
  .strict();

export const patchMeSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    avatarColor: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'avatarColor must be a hex color like #FF5A5F')
      .optional(),
    language: z.enum(['en', 'hi']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'currentPassword is required'),
    newPassword: passwordSchema,
  })
  .strict();

// ---------- Google sign-in (docs/DECISIONS.md "Google sign-in") ----------

export const googleSignInSchema = z
  .object({
    credential: z.string().min(1, 'credential is required'),
  })
  .strict();

// Multi-family: no `familyName` here either — see signupSchema above.
export const googleCompleteSchema = z
  .object({
    signupToken: z.string().min(1, 'signupToken is required'),
  })
  .strict();

export const setPasswordSchema = z
  .object({
    newPassword: passwordSchema,
  })
  .strict();

// ---------- Email module: password reset + invite acceptance ----------

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'token is required'),
    newPassword: passwordSchema,
  })
  .strict();

export const acceptInviteTokenParamSchema = z.object({
  token: z.string().min(1, 'token is required'),
});

// `password` is optional — a member invited with `loginMethod: 'google'`/`'both'` may instead
// complete via POST /auth/google directly (same email finds + activates their Membership without
// ever hitting this endpoint). This endpoint is the password-set path only.
export const acceptInviteSchema = z
  .object({
    token: z.string().min(1, 'token is required'),
    password: passwordSchema.optional(),
  })
  .strict();
