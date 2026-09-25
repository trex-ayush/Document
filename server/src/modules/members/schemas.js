import { z } from 'zod';

// POST /members (docs/API.md). The normal shape — the only one the app's own "Add member" form
// sends — is just `{ name, email }`: the person is always invited (Membership `status: 'invited'`),
// the invite email is sent, and the response carries the invite link so the admin can also share
// it themselves (WhatsApp/SMS). Everything else defaults (`role: 'member'`,
// `access: 'write'` so everyone can add, edit and share) and stays editable
// later via PATCH /members/:id.
//
// Optional extras still accepted for API callers/tests:
//  - `access` — set up front instead of via a later PATCH.
//  - `sendInvite: false` — still creates the invite and returns its link, but skips the email.
//  - `tempPassword` (legacy) — creates an ACTIVE login-enabled member with that password straight
//    away, no invite (unless `sendInvite: true` is also passed, in which case the invite wins).
//  - `canLogin: false` (legacy) — a profile-only record with no login; `email` not needed.
//
// Which sign-in methods (password/Google) are actually usable is a platform-wide setting, not a
// per-member admin choice.
export const createMemberSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(100),
    email: z.string().trim().min(1).email('Invalid email address').optional(),
    access: z.enum(['read', 'write']).optional().default('write'),
    canLogin: z.boolean().optional().default(true),
    tempPassword: z.string().min(8, 'tempPassword must be at least 8 characters').max(128).optional(),
    sendInvite: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.canLogin && !data.email) {
      ctx.addIssue({ path: ['email'], code: z.ZodIssueCode.custom, message: 'email is required' });
    }
  });

// POST /members/:id/invite-link — `resend: true` also emails the fresh link (default: just rotate
// and return it, for the admin to share by hand). `?resend=1` works too.
export const inviteLinkSchema = z
  .object({
    resend: z.boolean().optional(),
  })
  .strict();

export const patchMemberSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
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
