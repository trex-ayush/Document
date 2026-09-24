import { z } from 'zod';

const fieldTypeEnum = z.enum(['text', 'number', 'date', 'email', 'phone', 'url']);
const objectIdString = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const fieldDefSchema = z
  .object({
    key: z.string().trim().min(1, 'key is required').max(100),
    type: fieldTypeEnum.optional().default('text'),
    sensitive: z.boolean().optional().default(false),
  })
  .strict();

export const createDocumentTypeSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(100),
    icon: z.string().trim().min(1).max(50).optional().default('file'),
    defaultFolderId: objectIdString.nullable().optional(),
    fields: z.array(fieldDefSchema).optional().default([]),
  })
  .strict();

export const patchDocumentTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    icon: z.string().trim().min(1).max(50).optional(),
    defaultFolderId: objectIdString.nullable().optional(),
    fields: z.array(fieldDefSchema).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
