import { z } from 'zod';

// Kept deliberately simple (length only) — docs/API.md doesn't specify a complexity policy and
// over-constraining here would just be friction for every other module/test that signs up a
// user. Normalization (trim + lowercase) for email happens in service.js right before every
// User lookup/write, not here, to keep this schema resilient to zod version differences around
// chained string transforms.
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);
const emailSchema = z.string().trim().min(1).email('Invalid email address');

export const signupSchema = z
  .object({
    familyName: z.string().trim().min(1, 'familyName is required').max(150),
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
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'currentPassword is required'),
    newPassword: passwordSchema,
  })
  .strict();

export const reauthSchema = z
  .object({
    password: z.string().min(1, 'password is required'),
  })
  .strict();
