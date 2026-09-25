import { z } from 'zod';
import { SHARE_DURATIONS } from '../../models/Family.js';

// POST /family (docs/API.md) — the only way to get a family now, called either right after a
// cold signup/login (memberships: []) or from an existing user's "+ Create a new family" action.
export const createFamilySchema = z
  .object({
    familyName: z.string().trim().min(1, 'familyName is required').max(150),
  })
  .strict();

// maxFileMB / storageLimitMB / activityRetentionDays are NOT accepted here any more — they are
// platform-admin-only (PATCH /platform-settings). `.strict()` makes a request that still sends
// one fail with 400 VALIDATION_ERROR rather than silently ignoring it, so an out-of-date client
// learns the setting didn't take instead of believing it saved.
export const patchFamilySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    // Accepted top-level or under `settings` (same value either way; GET returns both).
    defaultShareDuration: z.enum(SHARE_DURATIONS).optional(),
    settings: z
      .object({
        defaultShareDuration: z.enum(SHARE_DURATIONS).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
