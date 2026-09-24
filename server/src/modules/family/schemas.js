import { z } from 'zod';

// POST /family (docs/API.md) — the only way to get a family now, called either right after a
// cold signup/login (memberships: []) or from an existing user's "+ Create a new family" action.
export const createFamilySchema = z
  .object({
    familyName: z.string().trim().min(1, 'familyName is required').max(150),
  })
  .strict();

// `null` on any of maxFileMB/storageLimitMB/activityRetentionDays = "unset, use the server's env
// var default" (see models/Family.js, utils/effectiveSettings.js) — accepted here via
// `.nullable()` alongside omission (`.optional()`), same "explicit reset to default" pattern used
// throughout this endpoint.
export const patchFamilySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    settings: z
      .object({
        activityRetentionDays: z.coerce.number().int().min(30).max(3650).nullable().optional(),
        maxFileMB: z.coerce.number().int().min(1).max(200).nullable().optional(),
        storageLimitMB: z.coerce.number().int().min(100).nullable().optional(),
        requireReauthForSecrets: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
