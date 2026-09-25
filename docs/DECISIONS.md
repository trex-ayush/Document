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

## Member-first home

- Home shows **people first**: one big tile per family member (avatar, name, relation, document
  count) plus a "Shared (whole family)" tile for documents with `memberId: null`. Tapping a tile
  opens `/people/:memberId` (or `/people/shared`) — a flat, paged list of that person's documents
  and vault items, with no folder step in between. User feedback was that "find mom's Aadhaar"
  is the 99% case and digging through folders first felt too complex.
- Folders stay real and fully working (`/browse`), reached from a "Browse by folder instead" link
  under the tiles and the nav — just no longer the first thing on Home.
- "Not tied to one person" has exactly one name everywhere — `common:people.shared` ("Shared
  (whole family)") — used by the home tile, the Search member filter, and the upload/edit member
  pickers. The API side is `memberId=none` on `GET /documents` and `GET /items`.
- Tile counts come from `GET /stats`'s `documentsByMember` (one aggregate, bin excluded by hand)
  rather than one list call per member.

## Dependencies (grows as modules land — keep sorted, keep this list truthful)

### server
express, mongoose, bcryptjs, jsonwebtoken, zod, helmet, cors, express-rate-limit, express-mongo-sanitize,
hpp, multer, sharp, archiver, dotenv, ua-parser-js, @aws-sdk/client-s3, file-type (magic-byte sniffing).
Dev: vitest, supertest, mongodb-memory-server, nodemon.

### client
react, react-dom, react-router-dom, @tanstack/react-query, axios, react-hook-form, zod,
@hookform/resolvers, react-hot-toast, react-easy-crop, exifr (EXIF rotation), qrcode.react (nice-to-have,
share QR), clsx, lucide-react (the single icon set — replaced the hand-rolled inline SVGs).
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

## Multi-family accounts

- `Membership` was already its own collection keyed by `{familyId, userId}` (see the original "Data
  model" comment in `models/Membership.js`) specifically so this didn't require a schema rewrite —
  a user can now hold any number of Membership rows across different families.
- **Session model change**: the access token dropped `membershipId`/`familyId`/`role`/`access` — it's
  now purely `{sub: userId}`. "Which family" comes from a per-request `X-Family-Id` header, validated
  against a live `Membership` lookup in `requireAuth` on every request (never cached in the token,
  never trusted from a body/query param). This means a role/access change or being added to a new
  family takes effect on the caller's very next request, not just after their token expires — a nice
  side benefit, not just a multi-family requirement. `req.auth`'s shape is unchanged, so no
  family-scoped route handler needed to change.
- **Invites decoupled from `User` creation**: a pending invite is a `Membership{invitedEmail, userId:
  null, status:'invited'}` — no `User` row exists until someone actually signs up, logs in with Google,
  or explicitly accepts. This is what makes "auto-join by email" possible: signing up (or logging in)
  with an invited email links + activates every matching pending Membership in that same request, no
  click-through required. (Earlier drafts of the invite feature pre-created a `User` at invite time —
  reworked once multi-family made that the wrong shape: a pre-created User can't tell "invited to one
  family, no account yet" apart from "already has an account elsewhere.")
- `POST /auth/accept-invite`'s password-set path only works for a genuinely new person (no `User` yet)
  — if the email already has an account, it responds `ACCOUNT_EXISTS` and points at login instead,
  since letting an unauthenticated invite-token request set a NEW password on an EXISTING account would
  be an account-takeover path.
- Family creation moved out of signup into its own `POST /family`, reused by both first-run onboarding
  (zero memberships after signup/login) and an existing user's "+ Create a new family" action.

## Platform settings

- `allowedLoginMethods: 'google'|'password'|'both'` — deliberately modeled as a deployment-wide
  singleton (`models/PlatformSettings.js`), NOT a per-family `Family.settings` field: the user's own
  requirement was a single on/off switch for the whole instance, not something each family's admin
  controls. Kept as its own small collection rather than an env var so it's changeable at runtime
  without a redeploy (env vars are still how the correct PERSON is identified —
  `PLATFORM_OWNER_EMAIL` — since the data model has no platform-super-admin role to grant a DB-backed
  permission to).
- `GET /platform-settings` is public (the login/signup page needs it before any session exists, to
  decide which sign-in buttons to show); `PATCH` checks the caller's email against
  `PLATFORM_OWNER_EMAIL` — a real access-control check, not client-side hiding.
- Enforced as a simple, stateless gate at the top of `POST /auth/signup`/`login`/`google`/
  `google/complete` — no session/family involvement, unlike the (briefly considered, then dropped as
  over-engineered for what the user actually asked for) idea of a per-family login-method policy tied
  into the `X-Family-Id` session-resolution path.
- `activityRetentionDays`, `maxFileMB`, `storageLimitMB` (nullable) — the deployment's operational
  limits, controlled ONLY here by the platform owner. See "Operational settings" below.

## Operational settings (maxFileMB / activityRetentionDays / storageLimitMB)

- **Platform-admin-only.** These three used to be per-family `Family.settings.*` overrides edited in
  a family's Settings > System tab (with `activityRetentionDays` also having a platform middle
  tier). Product decision: they are deployment-wide limits the platform owner controls, so family
  admins no longer see or change them. They live on `PlatformSettings` (edited from
  `/platform-settings`), each `default: null`, and resolve **platform value -> env var** — nothing
  else. `server/src/utils/effectiveSettings.js` centralizes this so every consumer (upload size
  check, activity-log `expiresAt`, storage-alert threshold) agrees.
- Stale per-family values are **ignored, not migrated.** The fields were removed from the `Family`
  schema, but an older family document may still carry `settings.maxFileMB` etc. in the raw DB.
  The resolver never reads them (it only reads `requireReauthForSecrets` from the family) and
  `serializeFamily()` rebuilds `settings` from an allow-list, so a now-invisible override can
  neither win nor reappear in `GET /family`. No data migration was needed for that guarantee.
- `PATCH /family` **rejects** (400 `VALIDATION_ERROR`, via the schema's `.strict()`) rather than
  silently stripping those keys: an out-of-date client then learns the change didn't take instead
  of showing "saved" for a value that does nothing.
- `null` = unset rather than a Mongoose default baking in the env value, so changing the env
  default later still takes effect for a deployment that never set one.
- The per-upload cap is resolved per request, and multer is built per request with that limit
  (it used to be one module-level multer capped at `env.MAX_FILE_MB`, which silently overrode any
  higher configured value). All lookups stay uncached (one primary-key read per call) and never
  throw — a lookup failure resolves to the env defaults.
- `services/alerts.js`'s storage check now awaits `getEffectivePlatformLimits()` instead of the
  old sync `resolveFamilySettings(family)` — the sync helper can't see a DB-backed platform value.
- `requireReauthForSecrets` stays per-family (Settings > Family) — it is a family security choice,
  not a deployment limit.
- `Activity` uses a per-document `expiresAt` field (computed at write time from the *current*
  retention setting) with `expireAfterSeconds: 0` — expire "at the stored value," not "N seconds
  after insert" — originally introduced so retention could vary per family, kept because it lets
  the platform owner change retention at runtime without rebuilding a TTL index. Changing the
  retention setting only affects activity logged after the change, which is expected.
- `STORAGE_DRIVER` (gridfs/s3) stays env + redeploy only, deliberately not exposed as an editable
  setting: switching to S3 needs real credentials (`S3_ENDPOINT`/`BUCKET`/keys) that only exist as env
  vars, so an admin flipping a DB toggle without them configured would just break uploads. It is shown
  read-only on the platform admin page only (`GET /platform-settings` adds `storageDriver` — and the
  env `defaults` for the three limits — for the platform owner only; `GET /family` no longer has it).

## Soft delete / recycle bin

- Explicit product decision: nothing a family member deletes is ever actually removed. Deleting a
  document, folder, or vault item sets `deletedAt`/`deletedBy` (via a shared `softDeletePlugin` on
  the `Document`/`Folder`/`VaultItem` schemas) instead of calling `deleteOne`/`deleteMany`, and
  never touches storage. The row moves into that family's "Bin," visible and restorable from the
  family's own `/bin` page. Real, permanent removal — the DB row AND the stored files — only ever
  happens from the platform admin panel's cross-family purge view
  (`POST /platform-settings/bin/purge`), a manual, explicit, platform-owner-only action. Nothing
  auto-purges, ever, regardless of how long something has sat in the bin.
- The plugin (`server/src/models/plugins/softDelete.js`) transparently excludes soft-deleted rows
  from every `find`/`findOne`/`findOneAndUpdate`/`findOneAndDelete`/`countDocuments`/`updateMany`/
  `updateOne` by default, UNLESS the caller's own filter already mentions `deletedAt` — this makes
  "every list/query site excludes the bin" a structural guarantee rather than something every call
  site has to remember. The opt-out is deliberately filter-shape-based (no separate query option):
  the Bin module filters FOR `deletedAt: { $ne: null }` to list the bin, or bypasses with the
  plugin's exported `ANY_DELETED_STATE` (`deletedAt: { $nin: [] }`) when a lookup needs to find a
  row regardless of state, e.g. walking a folder's ancestor chain during restore.
- **Legacy rows have no `deletedAt` field at all.** Everything created before soft delete shipped
  was never re-saved, and Mongoose schema defaults are only applied to documents Mongoose itself
  creates or saves (`.lean()` reads never add them). So the bypass must match a *missing* field,
  not just null/dates — the original `{ $exists: true }` silently skipped every legacy row. `$nin:
  []` ("not in the empty set") matches missing, null and any date. `$ne: false` would be
  equivalent in raw MongoDB but Mongoose refuses to cast a boolean to a Date path (CastError). The
  other two shapes were already correct: the default `{ deletedAt: null }` matches a missing field
  (legacy rows count as active everywhere, aggregates included), and `{ $ne: null }` excludes one
  (legacy rows never show up in any bin). Never use `$exists` on `deletedAt` as a lookup condition
  (the backfill below, which looks for the missing field on purpose, is the one exception).
- On top of that, `server.js` runs an idempotent startup backfill (`backfillDeletedAt` in the
  plugin) that sets `deletedAt: null, deletedBy: null` on rows where `deletedAt` doesn't exist, for
  all three models. It's safe on every boot (after the first run it matches nothing, via the
  `deletedAt` index), concurrent boots are harmless, and a failure is only logged — no query
  depends on it for correctness; it just makes stored data match the schema for ad-hoc DB queries,
  exports and future code. Tests (`server/tests/bin-legacy.test.js`) insert field-less rows through
  the raw collection to keep the no-backfill case covered.
- **Caveat the plugin does NOT cover: `Model.aggregate()`.** Mongoose query middleware only
  wraps the methods listed above — an aggregation pipeline bypasses it entirely. Every aggregate
  pipeline in the app (folder-tree counts, per-folder subfolder/document counts, vault items-by-
  kind stats) explicitly adds `deletedAt: null` to its own `$match` stage rather than relying on
  the plugin. Any new aggregation added later must do the same — this is the one place "exclude
  the bin" isn't automatic and has to be remembered by hand.
- Storage quota: bin contents **still count** against a family's storage quota/`storageBytes`,
  since the bytes are still physically stored — a soft delete frees no space. This is deliberately
  visible in the UI ("delete" is understood as "moves to bin," not "frees space immediately") so
  it isn't a surprise when storage usage doesn't drop after clearing out documents.
- Restoring a folder restores its whole soft-deleted subtree together (every descendant folder and
  every document/item inside any of them), mirroring the symmetric recursive delete cascade.
  Restoring a document/item whose parent folder chain is itself still in the bin also restores
  that ancestor chain (walking `parentId` upward, stopping at the first already-active folder) —
  a member restoring one file expects it to be reachable again, not to also have to separately dig
  its folder back out of the bin first. This was a deliberate choice over the alternative (restore
  to root, leaving the folder chain deleted); it matches how people actually expect "undo delete"
  to behave.
- No name-collision handling was needed for "create a folder/document with the same name as one
  already in the bin": names were never unique in this app (no unique index on `Folder.name`/
  `Document.title` even among active rows), so a binned item's name was already never a source of
  conflict for a new one.
- Uploading into (or otherwise targeting) a soft-deleted folder needs no special-case check: every
  folder lookup (`assertFolderExists`, `POST /folders`'s parent check, etc.) already goes through
  `Folder.findOne(scopeToFamily(...))`, which the plugin filters — a binned folder simply doesn't
  resolve, so these paths already 404 `FOLDER_NOT_FOUND` exactly as if the folder didn't exist.
- `PlatformSettings.binRetentionDays` (nullable `30`–`3650`, same convention as
  `activityRetentionDays`) is **informational/policy guidance only** — "items are expected to stay
  in a family's bin for about N days before you clear them," shown on the platform admin page.
  Deliberately never wired to any background job. An optional auto-purge-after-N-days feature is a
  plausible later addition but is a deliberate non-feature for now — do not build it without being
  explicitly asked, since permanently destroying user data automatically is a much bigger decision
  than this feature's current "admin does it by hand, on purpose" model.

## Email & notifications

- Gmail SMTP via `nodemailer` (`SMTP_HOST` unset = disabled cleanly: dev logs subject+link to the
  console, prod silently no-ops; the app never depends on email succeeding). Fire-and-forget from
  every call site, in-memory queue with 3 retries/backoff, never blocks a request or throws.
  `GET /family.emailEnabled` lets the client hide affected UI (forgot-password link, etc.).
- Admin **instant** alerts (member changes, risky shares, deletions, failed-login bursts, new-device
  logins, storage thresholds) are wired as a fire-and-forget hook (`services/alerts.js#onActivity`)
  called from `services/activityLogger.js` after every activity write — no other module's files
  needed to change to get alerting for their actions. Per-admin opt-out via
  `Membership.notificationPrefs.instant[eventKey]`.
- **No digest email** — considered (daily digest, then an opportunistic ">24h since last visit"
  variant) and dropped: the Dashboard and Activity Log already show recent uploads, share
  opens/downloads, secret reveals (by key), and expiring documents on demand, and this family opens
  the app only 1–2×/week, so a separate summary email was redundant. `Family.lastDigestAt` and
  `Membership.notificationPrefs.digest` were removed after being briefly added.
- Password reset and member invites share one `PasswordResetToken` model (`purpose: 'reset'|'invite'`)
  and token-issuing helper — a reset token proves "I can receive email at this address", an invite
  token additionally activates a `status:'invited'` Membership on use. An invited member may instead
  complete via Google sign-in using the same email; `POST /auth/google`'s existing "found by email,
  link" path already activates the membership identically, so there's no separate Google-invite route.
- **Adding a member = name + email, always an invite, link shown to the admin.** Product decision: users
  are non-technical and on phones, and email is often off, slow or in spam, so `POST /members { name,
  email }` always invites (`access: "read"` default, least privilege — relation/dob/access are edited
  later), queues the email AND returns `invite: { url, expiresAt, emailSent }` for the admin to send by
  WhatsApp/SMS/share sheet. The temp-password and profile-only shapes stay in the API for existing
  callers but the UI no longer offers them. `emailSent` comes from `isEmailEnabled()` at queue time —
  honest about "email is off", but not a delivery receipt, since `sendMail()` is fire-and-forget by design.
- Getting the link again later (`POST /members/:id/invite-link`) **rotates** the token: only the SHA-256
  hash is stored, so the old raw link can't be re-shown, and keeping several valid links alive would
  widen the window for a leaked one. The UI's "Share invite link" also re-emails (`resend: true`) so the
  invitee's newest email never holds a dead link.

## Deferred / nice-to-have (section 12) — not built in v1

Expiry-reminder emails, share download limits, QR codes for shares, offline PWA service worker,
"recently viewed", bulk select→move/zip/delete. Left as TODOs, not stubbed with dead code.
