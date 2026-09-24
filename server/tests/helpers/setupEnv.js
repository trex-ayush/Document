import crypto from 'node:crypto';
import { vi } from 'vitest';

// Side-effect module: sets every env var config/env.js requires, with test-safe dummy values,
// BEFORE any test file imports app.js/models/etc. Must be the first import in every test file
// that (transitively) imports anything under src/ — ES module evaluation runs top-level code in
// the order modules are first encountered, so as long as this import line comes first, env.js's
// eager `schema.safeParse(process.env)` sees these values.
//
// MONGODB_URI here is a placeholder never actually connected to — tests use mongodb-memory-server
// directly (tests/helpers/db.js) and call mongoose.connect() themselves with the in-memory URI,
// bypassing src/db/connect.js entirely (which would otherwise freeze in env.MONGODB_URI at
// import time, before the in-memory server even exists).
function setDefault(key, value) {
  if (!process.env[key]) process.env[key] = value;
}

setDefault('NODE_ENV', 'test');
setDefault('MONGODB_URI', 'mongodb://127.0.0.1:27017/family-vault-test-placeholder');
setDefault('CLIENT_URL', 'http://localhost:5173');
setDefault('JWT_ACCESS_SECRET', 'test-jwt-access-secret-not-for-prod-use-only');
setDefault('JWT_REFRESH_SECRET', 'test-jwt-refresh-secret-not-for-prod-use-only');
setDefault('FILE_TOKEN_SECRET', 'test-file-token-secret-not-for-prod-use-only');
setDefault('FILE_ENCRYPTION_KEY', crypto.randomBytes(32).toString('base64'));
setDefault('FIELD_ENCRYPTION_KEY', crypto.randomBytes(32).toString('base64'));
setDefault('STORAGE_DRIVER', 'local');
setDefault('MAX_FILE_MB', '20');
setDefault('ACTIVITY_RETENTION_DAYS', '365');

// bcryptjs (pure-JS, cost 12 — see docs/DECISIONS.md) is noticeably slower than native bcrypt,
// and most of our tests do at least one signup/login/member-create (1-2 hashes each). Vitest's
// 5000ms default per-test timeout is too tight for that on a modest sandboxed CPU; raise it
// globally here since every test file imports this module first.
vi.setConfig({ testTimeout: 30000, hookTimeout: 60000 });
