# Decisions log

Running log of choices made while building Family Vault, so later agents/readers don't have to guess why.

## Stack & tooling

- **JS only, ESM (`"type": "module"`)** in both `server` and `client`, per spec. No TypeScript files.
- **Package manager**: npm (workspaces NOT used — `server` and `client` are independent npm projects with
  their own `package.json`/lockfile, matching the separate Render/Vercel deploy roots).
- **Backend test runner**: `vitest` + `supertest` + `mongodb-memory-server` (in-memory Mongo, no real Atlas
  needed for CI/dev tests). Chosen over Jest because it's faster with ESM and needs no Babel config.
- **Password hashing**: `bcryptjs` (pure JS) instead of `bcrypt` (native). Reason: this is a Windows dev box
  without a guaranteed C++ build toolchain, and Render's build environment sometimes needs extra flags for
  native bcrypt. Cost factor still 12, same security property, ~2-3x slower per hash which is irrelevant at
  our scale. Spec says "bcrypt (cost 12)" — read as "the bcrypt algorithm", satisfied by bcryptjs.
- **IDs**: MongoDB ObjectIds everywhere, serialized as `id` string in API responses (never `_id`/`__v`).
- **Tokens**: JWT for access tokens and file tokens (`jsonwebtoken`). Refresh tokens and share tokens are
  opaque random bytes (`crypto.randomBytes`), never JWTs — they're capability tokens stored hashed
  (SHA-256) server-side, not self-describing, so they can be revoked instantly.

## Storage

- **Default driver: GridFS** (`STORAGE_DRIVER=gridfs`), via Mongoose's bundled `mongodb` driver
  (`mongoose.mongo.GridFSBucket`) — zero extra infra, works immediately against Atlas free tier. Documented
  512MB free-tier ceiling in README.
- **S3 driver**: `@aws-sdk/client-s3`, S3-compatible (works with Cloudflare R2 / Backblaze B2 / AWS), path-
  style addressing supported via `S3_ENDPOINT` for R2/B2 compatibility.
- **Local driver**: dev-only, writes under `server/uploads/` (gitignored), for fast local iteration without
  touching Mongo/S3 at all. Never selected by default, never used in production guidance.
- Adapter interface (`server/src/storage/index.js`): `put(key, stream|buffer, meta) -> {key,size}`,
  `getStream(key) -> Readable`, `delete(key) -> void`, `stat(key) -> {size}|null`. All three drivers
  implement this; modules only import the adapter, never a driver directly.

## Encryption

- **File bytes**: AES-256-GCM, one random 32-byte data key per file, wrapped (encrypted) with the master
  key from `FILE_ENCRYPTION_KEY` (also AES-256-GCM, key-wrapping). `{iv, tag, wrappedKey}` stored per file
  on the Document subdocument. Encrypt-before-store, decrypt-on-stream in the `/files/:signedToken` route.
- **Sensitive custom field values**: AES-256-GCM with `FIELD_ENCRYPTION_KEY`, stored as a single opaque
  string (`iv:tag:ciphertext`, base64) in `customFields[].value` when `sensitive: true`. Decrypted only by
  the reveal endpoint and by the document-detail serializer's masking step (which decrypts, masks, discards
  plaintext — never sends it except via `/reveal`).
- Both master keys are 32-byte, base64-encoded in env. README gives a one-line `node -e` generator command.

## Auth model

- Access token 15 min, refresh token 30 days, rotated every use, reuse-detection revokes the whole chain
  (sets `revokedAt` on every token in the lineage when a revoked token is presented again).
- Refresh token transport: **response body**, not cookies (spec's apiClient reference pattern stores it in
  localStorage and POSTs it explicitly to `/auth/refresh`/`/auth/logout`). Simpler CORS story across
  Vercel↔Render than cross-site cookies, acceptable for this app's threat model (see README security notes
  if cookie-based refresh is wanted later).
- One User <-> one Membership today (`Membership.userId` unique-ish per family), but Membership stays its
  own collection (not embedded in User) so a future multi-family user is a schema-compatible addition, per
  spec.

## Multi-tenancy

- Every Mongoose query in every module goes through `scopeToFamily(familyId, extra)` helper
  (`server/src/middleware/auth.js`) — merges `{ familyId }` into the query filter. `familyId` always comes
  from `req.auth.familyId` (set by `requireAuth` from the verified JWT), never from the request body/query/
  params. Route handlers that build a Mongoose filter without going through this helper are the one thing
  code review must catch.
- Tenant isolation integration test (Agent A) spins up two families, asserts family A's token gets 404/empty
  results against family B's documents/folders/shares/activity/members ids.

## Frontend

- **Design system source**: `apps/template` (already plain JSX) is copied/adapted directly for primitives,
  layout, tokens, dark mode. `apps/component` (TS) is used only as a reference and hand-ported to JS for
  pieces `apps/template` lacks: `apiClient` (axios refresh-queue pattern), `AuthContext`/`ThemeContext`
  shape, `Modal`, `Drawer`, `Dropdown`, `Tabs`, `Switch`, `ConfirmModal`, `FileDropzone`, `FormField`,
  `Textarea`, `Skeleton`. All ported files strip type annotations only — logic/behavior preserved.
- **Mobile nav gap**: `apps/template`'s Sidebar is `hidden lg:flex` (no mobile nav). AppShell (Agent D)
  adds a bottom tab bar (Home/Browse/Search/Shares/More) + slide-in drawer for phones, per spec.
- **State/data**: TanStack Query for all server state (no Redux/Zustand — the app's state is almost
  entirely server-derived; local-only state is folder view mode, theme, upload progress).
- **Forms**: react-hook-form + zod resolvers, one shared `zodResolver` pattern.
- Route-level code splitting via `React.lazy` per page.

## Dependencies (grows as modules land — keep sorted, keep this list truthful)

### server
express, mongoose, bcryptjs, jsonwebtoken, zod, helmet, cors, express-rate-limit, express-mongo-sanitize,
hpp, multer, sharp, archiver, dotenv, ua-parser-js, @aws-sdk/client-s3, file-type (magic-byte sniffing).
Dev: vitest, supertest, mongodb-memory-server, nodemon.

### client
react, react-dom, react-router-dom, @tanstack/react-query, axios, react-hook-form, zod,
@hookform/resolvers, react-hot-toast, react-easy-crop, exifr (EXIF rotation), qrcode.react (nice-to-have,
share QR), clsx.
Dev: vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite.

## Items module (passwords, numeric records, secure notes)

- Built as its own module (`VaultItem` model, `server/src/modules/items/**`, `/api/items/*`,
  `client/src/pages/items/**`, `client/src/features/items/**`), owned independently of the
  document/folder modules so it doesn't block or get blocked by Agents A–F. Full contract lives in
  docs/ITEMS.md (written by that module's owner) — docs/API.md only has a pointer + the shared
  integration seam.
- Integration seam: `server/src/modules/items/integration.js` exports
  `listItemsInFolder/searchItems/countItemsByKind/deleteItemsInFolders/moveItemsFolderCheck/
  getItemForShare` as stable-signature stubs. Agents B/C/F call these instead of importing
  `VaultItem` directly — the items owner fills in the bodies without touching callers' files.
- Reused rather than duplicated: `FIELD_ENCRYPTION_KEY` + the existing sensitive-value masking
  pattern from `customFields` (Document) — no new crypto material for item secrets.
- `Family.settings.requireReauthForSecrets` (default `true`) + `POST /auth/reauth` (5 min JWT
  capability, header `X-Reauth`) gate revealing ANY sensitive value — both the pre-existing
  `GET /documents/:id/fields/:fieldId/reveal` and the Items module's own reveal endpoint. Stateless
  JWT chosen over a DB-backed session row: it grants nothing beyond "recently typed the password
  again", already scoped to one membership+family, and 5 minutes is short enough that
  logout-revocation isn't worth a new collection.
- Shares: `targetType` gains `'item'`; `Share.includeSensitive` (default `false`) is enforced by
  the shares module — `true` requires a share password AND expiry <=24h, and is never allowed on a
  folder share. Default OFF everywhere else, i.e. shares exclude secrets unless explicitly opted in.
- Default folders gain "Passwords & Logins" and "Applications & Numbers" alongside the original
  seven (Agent A's signup seed).

## Google sign-in

- Google Identity Services (GIS) **ID-token flow** — no OAuth redirect URIs, no `passport.js`, no
  client secret. Server verifies the ID token with `google-auth-library`'s `OAuth2Client.verifyIdToken`.
- `User.passwordHash` is now optional (Google-only users have none); `User.authProviders` tracks which
  sign-in methods are usable. Password login fails with the same generic "invalid credentials" for a
  user with no `passwordHash`, so account existence/sign-in-method isn't leaked.
- New Google user (`googleId` not found, no matching email): server does NOT create anything — it
  returns `{ needsSignup: true, signupToken, profile }` and a second call
  (`POST /auth/google/complete`) creates the Family the same way `/auth/signup` does (reused service).
  Joining an existing family via Google only ever happens when an admin already added that email as a
  member — never an auto-join.
- Reauth (`POST /auth/reauth`) accepts either a password or a fresh Google ID token, for Google-only
  members to reveal secrets.
- Env: `GOOGLE_CLIENT_ID` (server) / `VITE_GOOGLE_CLIENT_ID` (client), both optional — unset disables
  the feature cleanly (button hidden client-side, `501` server-side) rather than half-working.

## Deferred / nice-to-have (section 12) — not built in v1

Email invites/forgot-password (SMTP), expiry-reminder emails, share download limits, QR codes for shares,
offline PWA service worker, "recently viewed", bulk select→move/zip/delete. Left as TODOs, not stubbed
with dead code.
