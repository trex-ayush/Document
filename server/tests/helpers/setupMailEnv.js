// Sets SMTP_* env vars BEFORE config/env.js's eager `schema.safeParse(process.env)` runs — same
// import-order requirement as setupGoogleEnv.js (a SIBLING import must resolve before any import
// of src/app.js or anything that transitively imports it). Only tests/mailer.test.js imports
// this, as its very first import. Every other test file leaves SMTP_HOST unset, matching
// production's "optional, unset = email disabled" default (see docs/DECISIONS.md-style notes in
// this agent's final report) — see tests/mailer-disabled.test.js.
if (!process.env.SMTP_HOST) {
  process.env.SMTP_HOST = 'smtp.test.invalid';
  process.env.SMTP_PORT = '465';
  process.env.SMTP_SECURE = 'true';
  process.env.SMTP_USER = 'test@example.com';
  process.env.SMTP_PASS = 'test-app-password';
  process.env.MAIL_FROM = 'Family Vault <test@example.com>';
}
