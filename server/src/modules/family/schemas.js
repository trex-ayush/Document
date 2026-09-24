import { z } from 'zod';

export const patchFamilySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    settings: z
      .object({
        activityRetentionDays: z.coerce.number().int().positive().max(3650).optional(),
        requireReauthForSecrets: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
