// Sets GOOGLE_CLIENT_ID to a non-empty test value BEFORE config/env.js's eager
// `schema.safeParse(process.env)` runs (see helpers/setupEnv.js's own comment on why import
// order — not statement order — is what matters for env vars: config/env.js parses process.env
// exactly once, on its first import, so this must be a SIBLING import that resolves before any
// import of src/app.js or anything that transitively imports it).
//
// Only tests/auth-google.test.js imports this, as its very first import. Every other test file
// (including tests/auth-google-disabled.test.js) leaves GOOGLE_CLIENT_ID unset, matching
// production's "optional, unset = feature off" default (see docs/DECISIONS.md "Google sign-in").
if (!process.env.GOOGLE_CLIENT_ID) {
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
}
