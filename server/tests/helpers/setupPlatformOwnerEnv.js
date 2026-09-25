// Sets PLATFORM_OWNER_EMAIL to a known test value BEFORE config/env.js's eager
// `schema.safeParse(process.env)` runs — same import-order requirement as setupGoogleEnv.js's own
// comment explains (config/env.js parses process.env exactly once, on its first import, so this
// must be a SIBLING import that resolves before any import of src/app.js or anything that
// transitively imports it).
//
// Only test files exercising the platform-owner-gated permanent-delete/purge routes import this,
// as their very first import. Every other test file leaves PLATFORM_OWNER_EMAIL unset, matching
// production's "unset = the platform-settings PATCH/purge routes always 403" default.
export const PLATFORM_OWNER_EMAIL = 'owner@platform.test';
if (!process.env.PLATFORM_OWNER_EMAIL) {
  process.env.PLATFORM_OWNER_EMAIL = PLATFORM_OWNER_EMAIL;
}
