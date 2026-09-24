// Forces GOOGLE_CLIENT_ID to the empty string, unconditionally, regardless of whatever a real
// local `server/.env` dev file (if one happens to exist in this sandbox) sets it to.
//
// Why this is needed: config/env.js does `import 'dotenv/config'`, which loads `.env` into
// process.env — but dotenv only fills in keys that are NOT already present (`hasOwnProperty`
// check, not a truthiness check). So setting `process.env.GOOGLE_CLIENT_ID = ''` here — as a
// SIBLING import that resolves before any import of src/app.js, same ordering rule as
// helpers/setupGoogleEnv.js — makes dotenv see the key as "already present" (even though empty)
// and skip it, guaranteeing the "Google sign-in disabled" posture this suite exercises holds
// deterministically, independent of the machine's own .env contents.
//
// Only tests/auth-google-disabled.test.js imports this, as its very first import.
process.env.GOOGLE_CLIENT_ID = '';
