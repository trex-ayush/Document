import 'dotenv/config';
import { z } from 'zod';

// Every env var the app reads, validated once at boot. Fail fast and loud instead of
// discovering a missing secret three requests into a demo.
const base64Key32 = z.string().refine(
  (v) => {
    try {
      return Buffer.from(v, 'base64').length === 32;
    } catch {
      return false;
    }
  },
  { message: 'must be base64 for exactly 32 bytes' },
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  CLIENT_URL: z.string().min(1, 'CLIENT_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET is too short'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET is too short'),
  FILE_TOKEN_SECRET: z.string().min(16, 'FILE_TOKEN_SECRET is too short'),

  FILE_ENCRYPTION_KEY: base64Key32,
  FIELD_ENCRYPTION_KEY: base64Key32,

  STORAGE_DRIVER: z.enum(['gridfs', 's3', 'local']).default('gridfs'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_REGION: z.string().optional().default('auto'),

  MAX_FILE_MB: z.coerce.number().int().positive().default(20),
  ACTIVITY_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:\n', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration — see above. Check server/.env against .env.example.');
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
