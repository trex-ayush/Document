import { z } from 'zod';

// POST /members has two shapes per docs/API.md:
//  - login-enabled:  { name, relation?, dob?, email, tempPassword, access }
//  - profile-only:   { name, relation?, dob?, canLogin: false }
// `canLogin` defaults to true (login-enabled) when omitted, matched with superRefine below.
export const createMemberSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(100),
    relation: z.string().trim().max(50).optional().default(''),
    dob: z.string().trim().min(1).optional().nullable(),
    canLogin: z.boolean().optional().default(true),
    email: z.string().trim().min(1).email('Invalid email address').optional(),
    tempPassword: z.string().min(8, 'tempPassword must be at least 8 characters').max(128).optional(),
    access: z.enum(['read', 'write']).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.canLogin) {
      if (!data.email) {
        ctx.addIssue({ path: ['email'], code: z.ZodIssueCode.custom, message: 'email is required when canLogin is true' });
      }
      if (!data.tempPassword) {
        ctx.addIssue({
          path: ['tempPassword'],
          code: z.ZodIssueCode.custom,
          message: 'tempPassword is required when canLogin is true',
        });
      }
      if (!data.access) {
        ctx.addIssue({ path: ['access'], code: z.ZodIssueCode.custom, message: 'access is required when canLogin is true' });
      }
    }
  });

export const patchMemberSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    relation: z.string().trim().max(50).optional(),
    dob: z.string().trim().min(1).optional().nullable(),
    access: z.enum(['read', 'write']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'newPassword must be at least 8 characters').max(128),
  })
  .strict();
