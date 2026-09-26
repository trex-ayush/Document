# Family Vault — API Contract

Base URL: `{API_BASE}/api` (e.g. `http://localhost:5000/api` in dev, `https://<app>.onrender.com/api` in prod).

This document is the single source of truth for the HTTP API. Every backend module implements exactly
these routes and shapes; every frontend service function calls exactly these routes. If a route needs to
change, update this file first, then code.

## Conventions

- All request/response bodies are JSON, except multipart upload endpoints (noted explicitly).
- All Mongo `_id` fields are serialized as `id` (string). `__v` is stripped. `passwordHash`, `tokenHash`,
  storage keys, encryption metadata and internal-only fields are never serialized.
- Dates are ISO 8601 strings (UTC).
- Auth: `Authorization: Bearer <accessToken>` header, except `POST /auth/refresh` (refresh token in body),
  `POST /auth/signup`, `POST /auth/login`, `GET /health`, and everything under `/public/*`.
- **Family-scoped requests also need `X-Family-Id: <familyId>` header** — see "Multi-family sessions" below.
  A handful of endpoints are family-agnostic and work without it (`GET`/`PATCH /auth/me`, `POST /family`
  (create), `/auth/logout*`, `/auth/refresh`, `/auth/change-password`, `/auth/set-password`).
- Pagination: offset-style endpoints take `page` (1-based, default 1) and `limit` (default 20, max 100) and
  return `{ items, page, limit, total, totalPages }`. Cursor-style endpoints (activity feed) take `cursor`
  and return `{ items, nextCursor }` (`nextCursor: null` when exhausted).
- Errors are always:
  ```json
  { "message": "Human readable message", "code": "MACHINE_CODE", "details": { "optional": "zod issues, etc." } }
  ```
  with the matching HTTP status (400 validation, 401 unauthenticated, 403 forbidden, 404 not found,
  409 conflict, 410 gone (expired/revoked share), 429 rate-limited, 500 server error).
  Codes worth knowing: `SESSION_EXPIRED` (refresh after 60 min idle), `SYSTEM_FOLDER` (the Shared folder
  can't be renamed, moved or deleted), `RESERVED_FOLDER_NAME` (no other folder may be called "Shared"),
  `LAST_FILE` (a document keeps at least one file),
  `FOLDER_NOT_FOUND`, `DOCUMENT_NOT_FOUND`, `ITEM_NOT_FOUND`, `VALIDATION_ERROR`.
- Rate limits: `/auth/*` credential routes (signup, login, Google, password reset, invites) share a
  strict 20-per-15-min limit per IP, plus tighter per-route limits; session upkeep (`/auth/me`,
  `/auth/refresh`, `/auth/logout*`) runs on every page load and only counts against the general
  300-per-minute API limit. `/public/*` is 60 per 15 min.
- Every list/detail response for a document/folder/file embeds short-lived **signed URLs**
  (`url` / `thumbUrl` / `downloadUrl`), never raw storage keys. See "File tokens" below.

## Auth headers & tokens

- **Access token**: JWT, 15 min expiry, `{ sub: userId }` **only** — it proves identity, not "which
  family". (Earlier versions of this API baked `membershipId`/`familyId`/`role`/`access` into the token;
  that doesn't work once a user can belong to multiple families, since the token would go stale the moment
  they're added to/removed from one. See "Multi-family sessions" below.) Sent as `Authorization: Bearer`.
- **Refresh token**: opaque random string (not a JWT) with a **60-minute idle expiry**: each refresh
  issues a new one that is again valid for 60 minutes, so the session lives as long as the person is
  active and ends after an hour without use (`401 SESSION_EXPIRED`). Returned in the body of
  signup/login/refresh responses. The client stores it (localStorage) and POSTs it to `/auth/refresh` and
  `/auth/logout`. The server stores only `sha256(token)` in `RefreshToken.tokenHash`, and **rotates** it
  (issues a new one, marks the old `revokedAt` + `replacedBy`) on every refresh. Reuse of a revoked token
  revokes the whole chain (theft detection).
- **File token**: short-lived JWT (1 hour), `{ fileId, familyId, purpose: 'view'|'thumb'|'download', kind }`,
  embedded as a query param in `url`/`thumbUrl`/`downloadUrl` so `<img src>` and mobile download work
  without custom headers. Verified by `GET /files/:signedToken`. Unaffected by multi-family — a file token
  already names its own family explicitly.

## Multi-family sessions

A `User` can hold a `Membership` in any number of `Family` records at once (owner of one, read-only
member of another, etc. — see docs/DECISIONS.md "Multi-family accounts"). The access token identifies
*who* is calling; it never says *which family* — that comes from a header on each request:

- **`X-Family-Id: <familyId>`** — sent on every family-scoped request. The client tracks an "active
  family id" client-side (localStorage, defaulting to the last-used or first family) and attaches it
  automatically (see the `apiClient` layer). `requireAuth` looks up `Membership.findOne({ userId, familyId:
  header, status: 'active' })` on every request — never trusts a family id from anywhere else — and 403s
  (`code: 'NOT_A_MEMBER'`) if the caller has no active membership in that family. Omitting the header on an
  endpoint that needs one is `400 { code: 'MISSING_FAMILY_ID' }`.
- Everything downstream of `requireAuth` is **unchanged**: `req.auth = { userId, membershipId, familyId,
  role, access, isOwner, membership }` has the exact same shape as before, just resolved from the header
  instead of the token. No family-scoped route handler needs to change for this.
- **`GET /auth/me`** is family-agnostic (no `X-Family-Id` needed) and returns the user's FULL membership
  list so the client can build a family switcher without extra calls — see its entry below.
- **Auto-join by email**: when an admin invites an email with no existing account
  (`Membership{ invitedEmail, userId: null, status: 'invited' }`, no `User` row created yet — see the
  updated `POST /members` below), and later someone signs up, logs in with Google, or completes Google
  signup using that exact email, every matching pending `Membership` is linked (`userId` set) and flipped
  to `status: 'active'` in that same request — no invite-link click-through required (the link still works
  as a direct route too, for someone who wants to join immediately without waiting to visit the app).

## Roles

- `role`: `admin` | `member` (on the Membership). `isOwner: true` marks the never-removable creator
  **of that family** (a user can be the owner of one family and an ordinary member of another).
- `access`: `read` | `write` (ignored for admins, who always have full access).
- Middleware: `requireAuth` (valid access token + `X-Family-Id` + active membership in that family),
  `requireWrite` (role admin OR access write), `requireAdmin` (role admin).

---

## Auth — `/auth`

### POST /auth/signup
Public. Creates ONLY the User — **no family is created here anymore** (see "Multi-family sessions" above).
Runs auto-join: any pending invite (`Membership.invitedEmail` matching, `status:'invited'`) for this email
is linked + activated immediately.

Request:
```json
{ "name": "Ayush Singh", "email": "ayush@example.com", "password": "Str0ngPass!" }
```
Response `201`:
```json
{
  "user": { "id": "...", "name": "Ayush Singh", "email": "ayush@example.com", "avatarColor": "#FF5A5F" },
  "memberships": [
    { "id": "...", "familyId": "...", "familyName": "The Singh Family", "role": "admin", "access": "write", "isOwner": true, "status": "active" }
  ],
  "accessToken": "eyJ...",
  "refreshToken": "base64url..."
}
```
`memberships` is `[]` for a genuinely cold signup with no pending invites — the client shows the
"Create your family" onboarding step in that case (see `POST /family` below). One or more entries means
auto-join matched — the client skips straight into the app with the first one active.
Errors: `409 EMAIL_TAKEN`.

### POST /auth/login
Public. Body: `{ "email": "...", "password": "..." }`. Response: same shape as signup (200).
Errors: `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`.
Rate limited (strict) per IP + email.

### POST /auth/refresh
Public (needs a valid refresh token). Body: `{ "refreshToken": "..." }`.
Response `200`: `{ "accessToken": "...", "refreshToken": "..." }` (rotated; the new one is valid for
another 60 minutes).
Errors: `401 SESSION_EXPIRED` (the token went unused for more than 60 minutes — the client signs out
quietly to the login page), `401 INVALID_REFRESH_TOKEN` (unknown token; also fired, and the whole chain
revoked, on reuse of a revoked token).

### POST /auth/logout
Body: `{ "refreshToken": "..." }`. Revokes that one refresh token. `204`. The access token is optional
(it may already have expired after an idle hour); when a valid one is sent the logout is recorded in
the activity log.

### POST /auth/logout-all
Auth required. Revokes every refresh token for the user. `204`.

### GET /auth/me
Auth required, **no `X-Family-Id` needed** (family-agnostic). Response:
`{ "user": {...}, "memberships": [{ "id", "familyId", "familyName", "role", "access", "isOwner", "status" }] }`
— every family this user belongs to (only `status:'active'` ones; an `'invited'` row isn't linked to a
`userId` yet so it can't appear here). The client picks the "active" one (persisted locally) and requests
that family's own `{membership, family}` detail lazily if needed (`GET /family` with that `X-Family-Id`),
or just uses the summary fields above for the switcher UI. Empty `memberships` after signup/login means
"show onboarding" (`POST /family` below).

### PATCH /auth/me
Auth required, no `X-Family-Id` needed. Body (partial): `{ "name": "...", "avatarColor": "#..." }`.
Returns updated `user`.

### POST /auth/change-password
Auth required. Body: `{ "currentPassword": "...", "newPassword": "..." }`. `204`.
Errors: `401 INVALID_CURRENT_PASSWORD`.

### Google sign-in

Google Identity Services (GIS) **ID-token flow** — no OAuth redirect URIs, no client secret. Disabled
entirely (client hides the button, these routes `501`) unless `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID`
are set. See docs/DECISIONS.md "Google sign-in" for the design rationale.

#### POST /auth/google
Public. Body: `{ "credential": "<Google ID token>" }`. Verified via `google-auth-library`, requires
`email_verified: true` from the token payload.
- Not found (no matching `googleId` or email) → nothing is created yet. Response `200`:
  `{ "needsSignup": true, "signupToken": "...", "profile": { "name", "email", "avatarUrl" } }`
  (`signupToken`: 10-minute JWT carrying the verified profile).
- Found (by `googleId`, or by email — auto-links `googleId` onto that email's existing User) → the
  normal disabled-user/disabled-membership checks apply, then the same session shape as
  `POST /auth/login`, plus `"needsSignup": false`. Logs `auth.login` with `meta: { method: 'google' }`.
Errors: `501 GOOGLE_SIGNIN_DISABLED`, `401 GOOGLE_TOKEN_INVALID`, `401 GOOGLE_EMAIL_NOT_VERIFIED`,
`403 ACCOUNT_DISABLED`. Rate limited (strict, per IP).

#### POST /auth/google/complete
Public. Body: `{ "signupToken": "..." }` — **no `familyName` anymore** (multi-family: see "Multi-family
sessions" above). Creates ONLY the User (Google-only, no password) from the verified profile in
`signupToken`, then runs auto-join exactly like `POST /auth/signup`. Response `201`: same shape as signup
— `{ user, memberships, accessToken, refreshToken }` (`memberships` empty unless auto-join matched).
Errors: `501 GOOGLE_SIGNIN_DISABLED`, `401 SIGNUP_TOKEN_INVALID`, `409 EMAIL_TAKEN`.
Rate limited (strict, per IP).

(`POST /auth/google/link` / `POST /auth/google/unlink` were removed — they now `404`. Users no longer
connect/disconnect Google from their own Settings; which sign-in methods the deployment accepts is the
platform-wide `allowedLoginMethods` policy on `/platform-settings`. A Google identity still gets
attached to an existing account automatically the first time that email signs in via
`POST /auth/google`.)

#### POST /auth/set-password
Auth required. Body: `{ "newPassword": "..." }`. Lets a Google-only account add its first password.
`204`. Errors: `409 PASSWORD_ALREADY_SET` (use `/auth/change-password`). Rate limited (strict, per user).

### Password reset & member invites (email module)

Disabled end-to-end when `SMTP_HOST` is unset (`GET /family` returns `emailEnabled: false` so the
client can hide/adjust affected UI) — email sending itself always no-ops safely either way (dev logs to
console, prod silently skips), these routes just have nothing to send.

#### POST /auth/forgot-password
Public. Body: `{ "email": "..." }`. **Always** `200 { "message": "..." }` — never reveals whether the
account exists. Rate limited per IP AND per email. Sends a reset link (`${CLIENT_URL}/reset-password?
token=...`, 32 random bytes, valid 30 min, single-use) when the account exists, isn't disabled, and email
is enabled.

#### POST /auth/reset-password
Public. Body: `{ "token": "...", "newPassword": "..." }`. Sets the password (adds `'password'` to
`authProviders` if missing — covers a Google-only user), marks the token used, **revokes every refresh
token for that user** (all devices logged out), sends a "password changed" email. `204`.
Errors: `400 INVALID_OR_EXPIRED_TOKEN`.

#### POST /auth/accept-invite
Public. Body: `{ "token": "...", "password"? }`. Only valid for a **brand-new person** (no `User` exists yet
for the invited email) — it creates that User (with the given password) and links+activates the one
Membership the token names. `password` is omitted when they'll instead complete via `POST /auth/google`
using the invited email (that path auto-links and activates every matching pending invite, not just this
one — same auto-join mechanism, so clicking the invite link first isn't required for that path either).
Response `200`: same session shape as login.
Errors: `400 INVALID_OR_EXPIRED_TOKEN`, `400 PASSWORD_REQUIRED`, `409 ALREADY_ACCEPTED`,
`409 { code: 'ACCOUNT_EXISTS' }` (a User already exists for this email — log in instead, that same
auto-join mechanism activates this membership on next login).

#### GET /auth/accept-invite/:token
Public. `200 { "email", "familyName", "allowsGoogle", "accountExists" }` — `accountExists: true` means the
client should show "log in to join" instead of a password-set form. Errors: `400 INVALID_OR_EXPIRED_TOKEN`.

---

## Family & Members

### POST /family
Auth required, **no `X-Family-Id` needed** (this is how you get your first one, or an additional one).
Body: `{ "familyName": "..." }`. Creates the Family + an owner/admin Membership for the caller + the
family's **Shared** system folder (`isSystem: true`). Response `201`: `{ "family": {...}, "membership": {...} }`. Used by both the first-run
"Create your family" onboarding screen (when `GET /auth/me` returns `memberships: []`) and the family
switcher's "+ Create a new family" action for an existing user.

### GET /family
Auth required. Response:
`{ "id", "name", "slug", "defaultShareDuration": "12h"|"24h"|"7d", "settings": { "defaultShareDuration" },
"storageBytes", "emailEnabled" }`. `defaultShareDuration` (also under `settings`, same value) is how long
a new share link lasts when the sharer doesn't pick another option; it starts at `12h`. `emailEnabled`
reflects whether SMTP is configured. Max file size, storage warning threshold, activity log retention
and the storage driver are deployment-wide and platform-admin-only — see `/platform-settings` below and
docs/DECISIONS.md "Operational settings".

### PATCH /family
Admin. Body: `{ "name"?, "defaultShareDuration"?: "12h"|"24h"|"7d" }` (`settings.defaultShareDuration` is
accepted too). Any other key (e.g. `maxFileMB`) is rejected with `400 VALIDATION_ERROR` and nothing is
saved. Returns the updated family.

### POST /family/test-email
Admin. Sends a test email to the caller. Response `200`: `{ "queued": true, "emailEnabled": boolean }`
(if `emailEnabled` is false, nothing is actually sent — dev logs it instead).

### GET /members
Auth required. Response: `{ "items": [Membership] }` (Membership includes `user.email` when `canLogin`,
`name`, `role`, `access`, `canLogin`, `isOwner`, `status`: `active|disabled|invited`).

### POST /members
Admin. **Normal shape (what the app's "Add member" form sends): `{ "name", "email" }` — nothing else.**
The person is always **invited**: the Membership is created with `status: "invited"`, `role: "member"`,
`access: "write"` (members can add, edit and share; only admins manage members and settings — an admin
can lower it to `"read"` via `PATCH /members/:id`), the invite email is queued, and the response carries the invite link
so the admin can also send it themselves (WhatsApp/SMS) if email is off, slow, or lands in spam.

If no `User` exists yet for that email, the Membership is created with `userId: null`, `invitedEmail:
email` — **no `User` row is pre-created** (multi-family: an invite is just a standing offer until someone
actually signs up/logs in with that email — see "Multi-family sessions"). If a `User` ALREADY exists for
that email (member of another family, or already signed up), the Membership is created directly with that
`userId` — it flips to `"active"` the moment they next log in (any method), same auto-join mechanism.

Response `201`: the created Membership plus
```json
{ "invite": { "url": "https://<client>/accept-invite?token=...", "expiresAt": "ISO date", "emailSent": true } }
```
`url` is valid 7 days, single-use. `emailSent` is `true` when email is configured and the invite was
queued — the mailer is fire-and-forget (never awaited, so SMTP can't slow the response), so it is not a
delivery receipt; `false` when email is disabled for the deployment (or skipped via `sendInvite: false`).

Optional extras (API callers/tests — the app's form never sends them): `access` (`"write"` default); `sendInvite: false` (still creates the invite and returns its link, but sends no
email). Legacy shapes: `tempPassword` (8–128 chars, without `sendInvite: true`) creates an **active**
member with a `User` + that password immediately, no `invite` in the response; `{ "name", "canLogin":
false }` creates a profile-only record (no email, no login).
Errors: `400 VALIDATION_ERROR` (missing/invalid email, unknown field), `409 ALREADY_MEMBER` (that email
already has a membership — pending or not — in this family; use the invite-link route below instead),
`409 EMAIL_TAKEN` (temp-password shape only).

### POST /members/:id/invite-link
Admin. Only for a Membership with `status: "invited"`. Body: `{ "resend"?: boolean }` (or `?resend=1`).
Returns a **fresh** invite link: `200 { "url", "expiresAt", "emailSent" }` — for when the admin closed the
"Send the invite" step before sharing, or the invitee lost the email. Invite tokens are stored only as a
hash, so an old link can't be shown again — this **rotates**: a new token is minted and **every earlier
invite link for this member stops working**. With `resend: true` the new link is also emailed
(`emailSent` as above); without it no email is sent (`emailSent: false`). The app's "Share invite link"
action always passes `resend: true`, so the newest email and the shared link are the same working link.
Logs `member.resend_invite` (`meta.emailed`). Rate limited per admin (30 / 15 min, shared with the route
below). Errors: `400 NOT_INVITED`, `403` (non-admin), `404 NOT_FOUND` (not in this family).

### POST /members/:id/resend-invite
Admin. Only for a Membership with `status: "invited"` — rotates the invite token (old link stops working)
and emails the new one. `204`. Same as `invite-link` with `resend: true`, minus the link in the response;
kept for existing callers. Errors: `400 NOT_INVITED`.

### PATCH /members/:id
Admin. Body (partial): `{ "name"?, "access"?, "status": "active"|"disabled" }`.
Disabling a member immediately revokes all their refresh tokens.

### POST /members/:id/reset-password
Admin. Body: `{ "newPassword": "..." }`. Revokes all the member's refresh tokens. `204`.

### DELETE /members/:id
Admin. Removes only the person's **access** (their membership, and their sign-in sessions); everything
they added — folders, documents, passwords, notes — stays with the family. `204`.
Errors: `400 CANNOT_REMOVE_OWNER`.

---

## Folders — `/folders`

A folder is a name only. The top level holds only folders: the family's **Shared** system folder
(`isSystem: true`, stored name `"Shared"`, shown as "साझा" in Hindi) plus the family's own folders.
Anything added without a folder goes into Shared. Shared can't be renamed, moved or deleted
(`400 SYSTEM_FOLDER`), and no other folder, at any level, may be named "Shared" or "साझा" (checked
trimmed and case-insensitively; `400 RESERVED_FOLDER_NAME`). Folders nest to any depth.

`Folder`: `{ id, name, parentId, isSystem, documentCount, itemCount, folderCount }` (counts are direct
children, Bin excluded).

### GET /folders/tree
Auth required. Every folder in the family, Shared first then A→Z: `{ "items": [Folder] }`.

### GET /folders/browse?folderId=root|<id>
Auth required. One level: `{ "folder": Folder|null, "breadcrumbs": [{ id, name, parentId, isSystem }],
"folders": [Folder], "documents": [DocumentSummary], "items": [ItemSummary] }`. `folderId=root` (or
omitted) is the top level, where `documents` and `items` are always empty. `breadcrumbs` is root-first
and ends with the current folder. Errors: `400 VALIDATION_ERROR` (malformed `folderId`),
`404 FOLDER_NOT_FOUND` (missing or in the Bin).

### POST /folders
Write. Body: `{ "name", "parentId"?: "root"|"<id>" }` (`name` trimmed, 1–120 chars; default top level).
Response `201`: Folder. Errors: `400 RESERVED_FOLDER_NAME` (`name` is "Shared"/"साझा", any case),
`404 FOLDER_NOT_FOUND` (parent).

### PATCH /folders/:id
Write. Body (partial): `{ "name"?, "parentId"?: "root"|"<id>" }` (a `parentId` change is a move; `"root"`
moves it to the top level). Errors: `400 SYSTEM_FOLDER`, `400 RESERVED_FOLDER_NAME` (renaming to
"Shared"/"साझा", any case — re-sending an older folder's unchanged name is allowed),
`400 CANNOT_MOVE_INTO_DESCENDANT`, `404 FOLDER_NOT_FOUND`.

### DELETE /folders/:id
Write. Recursive **soft** delete: the folder, every subfolder and every document/item inside them move
to the family's Bin (restorable from `/bin`; storage untouched — see docs/DECISIONS.md "Soft delete /
recycle bin"). Without `?confirm=1` nothing is deleted and the response is
`{ "requiresConfirm": true, "folderCount", "documentCount", "itemCount", "fileCount" }`; with it,
the same counts with `requiresConfirm: false`. Errors: `400 SYSTEM_FOLDER`.

### POST /folders/:id/zip-link
Any member. Response: `{ "url": "/api/files/zip/<token>" }` — a short-lived link that streams a ZIP of
every file in the folder and its subfolders.

---

## Documents — `/documents`

A document is a title, one or more files, and notes. Notes are encrypted at rest and returned as
plain text to members.

`DocumentSummary`: `{ id, title, folderId, fileCount, primaryThumbUrl, createdAt, updatedAt }`
(`primaryThumbUrl`: signed thumbnail of the first file that has one, or `null`).

### GET /documents?folderId=&page=&limit=
Auth required. Newest first; `folderId` = directly in that folder.
`{ "items": [DocumentSummary], "page", "limit", "total", "totalPages" }`.

### GET /documents/:id
Auth required. `{ id, title, folderId, notes, files, breadcrumbs, createdBy, createdByName, updatedByName,
createdAt, updatedAt }` (`createdByName` / `updatedByName`: the member's name or `null`; only on this GET).
`files[]`: `{ id, label, order, originalName, mimeType, size, width, height, url, thumbUrl, downloadUrl,
uploadedAt, text }` — `text` is what the app read from that file ('' for none), encrypted at rest and
returned only here (never in lists, folder browsing, search results or public share pages). Logs `document.view` (throttled: once per member per document per 10 min).
Errors: `404 DOCUMENT_NOT_FOUND`.

### POST /documents
Write. **Multipart** form-data:
- field `data`: JSON string `{ "title", "folderId"?, "notes"? }` (`title` 1–200 chars; `notes` up to 5000;
  `folderId` omitted, `null` or `"root"` = the Shared folder)
- field `files`: one or more files (max 20)
- field `labels` (optional): JSON array of strings, same length/order as `files` — each file's display
  name (the app sends the file name without its extension)
- field `texts` (optional): JSON array, same length/order as `files`, of the text read from each file
  (string, or `null`/`''` for none). Trimmed and cut to 20 000 characters; stored encrypted per file.
  A wrong length is `400 VALIDATION_ERROR`.

Response `201`: full Document.
Errors: `400 VALIDATION_ERROR` (no file, bad title), `400 UNSUPPORTED_FILE_TYPE`, `413 FILE_TOO_LARGE`,
`404 FOLDER_NOT_FOUND`.

### PATCH /documents/:id
Write. JSON body (partial): `{ "title"?, "notes"?, "folderId"? }` (`folderId: null` or `"root"` moves it
into Shared). Returns the full Document.

### DELETE /documents/:id
Write. Moves the document (with its files) to the Bin. `204`.

### POST /documents/:id/files
Write. Multipart: `files` (+ optional `labels` and `texts`, as for POST /documents). Appends files.
Returns the updated Document.

### PATCH /documents/:id/files/:fileId/text
Write. JSON body `{ "text": string | null }` — replaces the text read from that file (trimmed, cut to
20 000 characters; `null` or `''` clears it). Logs `document.update` (`meta: { fields: ['fileText'],
fileId }`). Returns the updated Document. Errors: `404 DOCUMENT_NOT_FOUND`, `404 FILE_NOT_FOUND` (missing
or in the Bin).

### DELETE /documents/:id/files/:fileId
Write. Moves one file to the family's Bin (restorable via `POST /bin/file/:fileId/restore`; the stored
file stays in storage and still counts toward storage until the platform admin purges it). From then
on the file is left out everywhere: document detail and `fileCount`, thumbnails, ZIPs, public share
pages (even a share that named it in `fileIds`), search, and its signed URLs stop working
(`401 INVALID_OR_EXPIRED_FILE_TOKEN`). A document always keeps at least one file not in the Bin:
`400 LAST_FILE` — delete the document instead. `404 FILE_NOT_FOUND` if the file is missing or already
in the Bin. Logs `document.file.delete` (`meta: { fileId, name, title }`). Returns the updated Document.

### POST /documents/:id/zip-link
Any member. Body: `{ "fileIds"? }` (omit = all files). Response: `{ "url": "/api/files/zip/<token>" }`.

### GET /documents/:id/activity
Auth required. `{ "items": [Activity] }` for this document only (its views, edits, files and share
links), newest first, capped at 200.

---

## Files — `/files`

### GET /files/:signedToken
No `Authorization` header needed — the signed token itself is the credential. Query: `?download=1` to force
`Content-Disposition: attachment`. Supports HTTP `Range` for PDFs/video. Streams decrypted bytes.
Logs `file.download` when `download=1`, nothing for inline `view`/`thumb` purposes.
Errors: `401 INVALID_OR_EXPIRED_FILE_TOKEN`.

### GET /files/zip/:token
No `Authorization` header — the short-lived zip token from a `zip-link` route is the credential.
Streams a ZIP of that folder's or document's files.

---

## Shares — `/shares`

Every folder, document and single file can be shared as a public link. Anyone with the link sees
**only titles and files** — never notes, passwords or note items. A link lasts `12h`, `24h` (1 day) or
`7d`; there is no "never", no password and no label. All routes need write access.

`Share`: `{ id, targetType: 'document'|'folder', targetId, targetLabel, targetInBin, fileIds, duration,
expiresAt, status: 'active'|'expired'|'revoked', revokedAt, openCount, downloadCount, lastOpenedAt,
createdBy, createdAt }`. The raw link (`url`) is returned only once, on create. `targetInBin` is `true`
(list only) when the shared document or folder is in the Bin: its link shows "not found" until it is
restored, and `targetLabel` still names it.

### GET /shares?targetId=&status=
`{ "items": [Share] }`, newest first. `status`: `active|expired|revoked`.

### POST /shares
Body: `{ "targetType": "document"|"folder", "targetId", "fileIds"?: ["..."], "duration"?: "12h"|"24h"|"7d" }`.
`fileIds` (documents only) shares just those files — e.g. one photo. Without `duration` the family's
`defaultShareDuration` is used. Response `201`: `{ ...Share, "url": "https://<client>/s/<token>" }`.
Errors: `404 NOT_FOUND` (target, or none of `fileIds` belong to the document).

### PATCH /shares/:id
Body: `{ "revoke"?: true, "extendTo"?: "12h"|"24h"|"7d" }` — revoke turns the link off at once;
`extendTo` restarts the clock from now. Returns the Share.

### DELETE /shares/:id
Removes the row (tidying the list). Creator or admin only.

### GET /shares/:id/access-log
`{ "items": [{ time, ipHash, device, browser, action }] }` (`share.open` / `share.download`).

---

## Public (no auth) — `/public`

### GET /public/shares/:token
Response `200`:
```json
{
  "familyName": "The Singh Family",
  "targetType": "document",
  "expiresAt": "2026-10-01T00:00:00.000Z",
  "document": { "title": "...", "files": [{ "id","label","originalName","url","thumbUrl","downloadUrl","mimeType","size" }] }
}
```
or for folder shares `"folderTree": { "name", "isSystem", "documents": [{ "title", "files" }], "subfolders": [ recursive... ] }`
(`isSystem` lets the page show the Shared folder in the reader's language). Nothing else — no notes,
no items, no internal ids beyond file ids. Counts an open. Errors: `404 NOT_FOUND`, `410 { code: 'EXPIRED' }`,
`410 { code: 'REVOKED' }`.

### POST /public/shares/:token/zip-link
Streams a ZIP of every file the link covers (`Content-Type: application/zip`) directly as the response
body. Counts a download. Same `404`/`410` rules.

---

## Activity & Stats

### GET /activity?memberId=&action=&from=&to=&cursor=&limit=
Admin or write. `{ "items": [Activity], "nextCursor": "..."|null }`.
`Activity`: `{ id, actorName, action, targetType, targetId, documentId?, folderId?, shareId?, meta, createdAt }`.

### GET /stats
Auth required. The Home count tiles; anything in the Bin is not counted:
```json
{ "counts": { "documents": 0, "files": 0, "passwords": 0, "notes": 0, "folders": 1, "members": 1 } }
```
`files` = the files in those documents (a file moved to the Bin on its own isn't counted),
`passwords` = `login` items, `notes` = `note` items, `folders` includes Shared.

---

## Items — `/items`

Passwords (`kind: 'login'`) and notes (`kind: 'note'`). Full contract: **docs/ITEMS.md**.

---

## Search — `/search`

### GET /search?q=&folderId=&limit=
Auth required. `q` (required, 1–200 chars) is matched **case-insensitively and by part of a word**
against folder names, document titles and notes, the text read from each document file (not files in
the Bin), item titles, usernames, notes and extra-field keys/values. A saved password is **never** searched. `folderId` limits the search to that folder and all
its subfolders (omitted, empty or `root` = everywhere). `limit` (1–50, default 20) applies to each list.
```
{ "folders":   [{ id, name, parentId, isSystem, path }],
  "documents": [{ id, title, folderId, path, fileCount, thumbnailUrl, updatedAt, snippet }],
  "items":     [{ id, kind, title, folderId, path, updatedAt, snippet }] }
```
`path` is where the result lives, e.g. `"Papa › Bank"` (a folder's own name is not included; a top-level
folder has `""`). Paths name the Shared folder by its stored name `"Shared"` — the client shows it in
the reader's language. `snippet` is a short excerpt around the match when it was in notes or fields
(`null` for a title match); a match in a file's text is prefixed with that file's name, e.g.
`"Back: …ABCDE1234F…"`. The Shared folder also matches the Hindi name "साझा".
Errors: `400 VALIDATION_ERROR`, `404 FOLDER_NOT_FOUND`.

---

## Notification preferences — `/me`

### GET /me/notification-prefs
Admin only (only admins receive alert emails). Response `200`: `{ "instant": { [eventKey]: boolean } }`.
Event keys: `member_added`, `member_removed`, `member_disabled`, `member_access_change`,
`invite_accepted`, `document_folder_delete`, `failed_logins`, `new_device_login`, `storage_threshold`. Missing/unset keys default to `true` (on).

### PATCH /me/notification-prefs
Admin only. Body: `{ "instant": { [eventKey]: boolean, ... } }` (merges into the existing map — only
send the keys you're changing). Response `200`: the updated `{ "instant": {...} }`.

---

## Platform settings — `/platform-settings`

Deployment-wide, NOT per-family — one setting for the whole instance. See docs/DECISIONS.md
"Platform settings".

### GET /platform-settings
Public (no auth) — the login/signup page needs this before any session exists, to decide which
sign-in options to show. Response:
```
{ "allowedLoginMethods": "google"|"password"|"both",
  "activityRetentionDays": number|null,
  "maxFileMB": number|null,
  "storageLimitMB": number|null,
  "binRetentionDays": number|null,
  "smtp": { "host": string|null, "port": number|null, "secure": boolean|null, "user": string|null,
            "mailFrom": string|null, "hasPassword": boolean },
  "isPlatformOwner"?: boolean,
  // platform owner only:
  "defaults"?: { "activityRetentionDays": number, "maxFileMB": number, "storageLimitMB": number },
  "storageDriver"?: "gridfs"|"s3"|"local" }
```
`smtp.*` and the top-level `activityRetentionDays`/`maxFileMB`/`storageLimitMB` are the RAW stored
value (`null` when unset), never a resolved "effective" one. `smtp.passEncrypted` is never sent;
`hasPassword` says whether one is currently stored. `isPlatformOwner` is present only when called
with a valid bearer token, omitted entirely for an anonymous caller. `defaults` (the env value each
blank limit falls back to) and `storageDriver` (read-only, env + redeploy only) are added only when
the caller IS the platform owner — never on the anonymous/non-owner response.

### PATCH /platform-settings
Auth required. Only the user whose email matches env `PLATFORM_OWNER_EMAIL` may write (everyone
else gets `403 FORBIDDEN` — there's no platform-super-admin role in the data model, identity is
env-configured). Body (partial, any subset):
```
{ "allowedLoginMethods"?: "google"|"password"|"both",
  "activityRetentionDays"?: number|null,
  "maxFileMB"?: number|null,
  "storageLimitMB"?: number|null,
  "binRetentionDays"?: number|null,
  "smtp"?: { "host"?: string|null, "port"?: number|null, "secure"?: boolean|null, "user"?: string|null,
             "mailFrom"?: string|null, "pass"?: string|null } }
```
Response: same shape as `GET` (minus `isPlatformOwner`, plus the owner-only `defaults` and
`storageDriver`).

Enforcement: `allowedLoginMethods` gates `POST /auth/signup`/`login` (rejected with
`403 { code: 'LOGIN_METHOD_NOT_ALLOWED' }` when set to `'google'`) and `POST /auth/google`/
`google/complete` (same error when set to `'password'`) — checked at the top of each endpoint, a
simple global gate, not tied to sessions or families.

Operational limits — platform-admin-only, there is no per-family override. Each is nullable
(`null` = use the env fallback) and resolves **this value -> env**, nothing else:
- `maxFileMB` (`1`–`200`, env `MAX_FILE_MB`): largest file allowed per upload
  (`413 FILE_TOO_LARGE` above it) — applies to every family.
- `storageLimitMB` (`>=100`, env `STORAGE_LIMIT_MB`): storage used past 80%/95% of this triggers the
  admin alert emails, per family.
- `activityRetentionDays` (`30`–`3650`, env `ACTIVITY_RETENTION_DAYS`): how long new activity-log
  entries are kept.
See `server/src/utils/effectiveSettings.js` and docs/DECISIONS.md "Operational settings".

`smtp.*`: deployment-wide SMTP override, field-by-field fallback to the matching env `SMTP_*` var
when unset in the DB — see `server/src/services/mailer.js#getEffectiveSmtpConfig()` and
docs/DECISIONS.md "Email & notifications". `smtp.pass`: omit to leave the stored password
untouched, `null` to clear it (falls back to `env.SMTP_PASS`), a non-empty string to set a new one
(encrypted at rest, never returned in any response).

`binRetentionDays` (nullable, `30`–`3650`): **informational only** — shown on the platform admin
page as "items are expected to stay in a family's bin for about N days before you clear them."
Never read by any automatic job; nothing in a family's bin is ever removed except by the platform
owner's own explicit purge action below. See docs/DECISIONS.md "Soft delete / recycle bin".

### GET /platform-settings/bin
Auth required, platform-owner only (`403 FORBIDDEN` for anyone else). The bin contents of **every
family** on the deployment, newest-deleted first — the only cross-family listing in the app.
```
{ "items": [{ "id": string, "type": "document"|"folder"|"item"|"file", "name": string,
              "familyId": string, "deletedAt": string,
              // type "file" only (id = the file's own id):
              "originalName"?: string, "documentId"?: string, "documentTitle"?: string,
              "documentDeleted"?: boolean }] }
```

### POST /platform-settings/bin/purge
Auth required, platform-owner only (`403 FORBIDDEN` for anyone else). Body:
```
{ "items": [{ "type": "document"|"folder"|"item"|"file", "id": string }] }
```
Permanently removes each listed entry — the DB row(s) and, for a document/folder, its stored
files (`storage.delete()`). A `file` entry (`id` = the file's own id) removes that one file's stored
blob and thumbnail and pulls it out of its document. This is the **only** route in the app that ever does either of those
things; everywhere else, "delete" only sets `deletedAt`. Purging a folder cascades to its whole
soft-deleted subtree (mirroring the old hard-delete cascade). Each entry is purged independently —
one bad/already-active id doesn't abort the rest. Response:
```
{ "results": [{ "type": string, "id": string, "purged": boolean, "error"?: string }] }
```

---

## Bin (recycle bin) — `/bin`

Family-scoped soft-delete recovery. See docs/DECISIONS.md "Soft delete / recycle bin" for the
model: deleting a document, folder, or vault item never actually removes it — it moves into the
family's Bin (`deletedAt` set) until a member restores it, or the platform owner permanently
purges it via `/platform-settings/bin/purge` above. Auth required (any family member) for both
routes below; `requireWrite` for restoring, same access level normal deletes require.

### GET /bin
This family's whole bin, newest-deleted first, across all four types.
```
{ "items": [{ "id": string, "type": "document"|"folder"|"item"|"file", "name": string,
              "deletedAt": string, "deletedBy": string|null, "deletedByName": string|null }] }
```
`deletedBy` is the membership id of whoever deleted it (`null` for older entries), `deletedByName`
that member's current name. A `file` entry is one file deleted out of a document: `id` is the file's
own id, `name` its label (or file name if it has none), plus
`{ "originalName": string, "documentId": string, "documentTitle": string, "documentDeleted": boolean }`.
`documentDeleted: true` means the whole document is in the Bin too — a file deleted before its document
stays listed separately and can still be restored.

### POST /bin/:type/:id/restore
`:type` is `document`, `folder`, `item` or `file` (`:id` = the file's own id). Clears `deletedAt` on
the entry. Restoring a **file** puts it back into its document; if that document is itself in the Bin,
the document is restored along with it (with its folder chain, as below) — its other deleted files stay
in the Bin. Logs `document.file.restore` (`meta: { fileId, name, title, documentRestored }`) and
responds `{ "restored": { "type": "file", "id", "documentId", "documentRestored": boolean } }`. Restoring a
**folder** also restores its whole soft-deleted subtree (every descendant folder and every
document/item inside any of them), mirroring the recursive delete cascade. Restoring a
**document or item** whose parent folder chain is itself still in the bin also restores that
chain, so the restored entry is immediately reachable again rather than coming back invisible
inside a still-deleted folder (deliberate choice — see docs/DECISIONS.md). Logs
`document.restore`/`folder.restore`/`item.restore` activity. `404 NOT_IN_BIN` if the id doesn't
exist or isn't currently deleted.
```
{ "restored": { "type": string, "id": string } }
```

---

## Health

### GET /health
Public. `{ "status": "ok", "uptime": 123.4 }`. No `/api` prefix required but also mounted at
`/api/health` for consistency with the Render health-check path used in deployment docs.
