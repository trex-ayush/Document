import { z } from 'zod';
import { env } from '../../config/env.js';

// POST /members has two shapes per docs/API.md:
//  - login-enabled:  { name, relation?, dob?, email, tempPassword?, access, sendInvite? }
//  - profile-only:   { name, relation?, dob?, canLogin: false }
// `canLogin` defaults to true (login-enabled) when omitted, matched with superRefine below.
//
// Which sign-in methods (password/Google) are actually usable is a platform-wide setting, not a
// per-member admin choice — this schema no longer takes a `loginMethod` field. Every login-enabled
// member gets a password (via `tempPassword` or the invite flow) and can additionally link Google
// later (see auth/googleService.js), regardless of how they were created.
//
// `sendInvite` (email module) — when true, the tempPassword dance above is bypassed entirely: the
// member is invited by email (`Membership.status: 'invited'`) and sets their own password via
// POST /auth/accept-invite (or signs in with Google directly). Omitted: defaults to whether SMTP
// is configured at all (`Boolean(env.SMTP_HOST)`) — see members/routes.js. `tempPassword` becomes
// optional once invite mode resolves true.
export const createMemberSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(100),
    relation: z.string().trim().max(50).optional().default(''),
    dob: z.string().trim().min(1).optional().nullable(),
    canLogin: z.boolean().optional().default(true),
    email: z.string().trim().min(1).email('Invalid email address').optional(),
    tempPassword: z.string().min(8, 'tempPassword must be at least 8 characters').max(128).optional(),
    access: z.enum(['read', 'write']).optional(),
    sendInvite: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.canLogin) {
      if (!data.email) {
        ctx.addIssue({ path: ['email'], code: z.ZodIssueCode.custom, message: 'email is required when canLogin is true' });
      }
      if (!data.access) {
        ctx.addIssue({ path: ['access'], code: z.ZodIssueCode.custom, message: 'access is required when canLogin is true' });
      }
      const useInvite = data.sendInvite !== undefined ? data.sendInvite : Boolean(env.SMTP_HOST);
      if (!useInvite && !data.tempPassword) {
        ctx.addIssue({
          path: ['tempPassword'],
          code: z.ZodIssueCode.custom,
          message: 'tempPassword is required unless an invite email will be sent',
        });
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
