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
// SUPER_ADMIN_EMAIL wins over PLATFORM_OWNER_EMAIL, so a developer's own super admin in their
// local server/.env would otherwise take the owner role away from the test account. Pin it here
// (dotenv never overrides a variable that's already set).
process.env.SUPER_ADMIN_EMAIL = PLATFORM_OWNER_EMAIL;
