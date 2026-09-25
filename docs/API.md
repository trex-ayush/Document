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
  (create), `/auth/logout*`, `/auth/refresh`, `/auth/change-password`, `/auth/reauth`, `/auth/set-password`,
  the Google account link/unlink endpoints).
- Pagination: offset-style endpoints take `page` (1-based, default 1) and `limit` (default 20, max 100) and
  return `{ items, page, limit, total, totalPages }`. Cursor-style endpoints (activity feed) take `cursor`
  and return `{ items, nextCursor }` (`nextCursor: null` when exhausted).
- Errors are always:
  ```json
  { "message": "Human readable message", "code": "MACHINE_CODE", "details": { "optional": "zod issues, etc." } }
  ```
  with the matching HTTP status (400 validation, 401 unauthenticated, 403 forbidden, 404 not found,
  409 conflict, 410 gone (expired/revoked share), 429 rate-limited, 500 server error).
- Every list/detail response for a document/folder/file embeds short-lived **signed URLs**
  (`url` / `thumbUrl` / `downloadUrl`), never raw storage keys. See "File tokens" below.

## Auth headers & tokens

- **Access token**: JWT, 15 min expiry, `{ sub: userId }` **only** — it proves identity, not "which
  family". (Earlier versions of this API baked `membershipId`/`familyId`/`role`/`access` into the token;
  that doesn't work once a user can belong to multiple families, since the token would go stale the moment
  they're added to/removed from one. See "Multi-family sessions" below.) Sent as `Authorization: Bearer`.
- **Refresh token**: opaque random string (not a JWT), 30 day expiry. Returned in the body of
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
Response `200`: `{ "accessToken": "...", "refreshToken": "..." }` (rotated).
Errors: `401 INVALID_REFRESH_TOKEN` (also fired, and the whole chain revoked, on reuse of a revoked token).

### POST /auth/logout
Auth required. Body: `{ "refreshToken": "..." }`. Revokes that one refresh token. `204`.

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

### POST /auth/reauth
Auth required. Body: `{ "password": "..." }` **or** `{ "credential": "<fresh Google ID token>" }`
(exactly one) — Google-only users (no password) use the credential path. Verifies the caller's identity
and returns a short-lived (5 min) capability: `{ "reauthToken": "..." }`. Sent back as the `X-Reauth`
header on any endpoint that reveals a sensitive value (`GET /documents/:id/fields/:fieldId/reveal`, and
the Items module's reveal endpoint — see docs/ITEMS.md) when `Family.settings.requireReauthForSecrets` is
true (the default; an admin can turn it off in Settings). Logs `auth.reauth`.
The credential path requires `sub` to match the account's already-linked `googleId` and `iat` to be within
the last 5 minutes (rejects a stale-but-still-valid token — this endpoint proves "you just now proved your
identity", not just "you have a valid Google session").
Errors: `401 INVALID_CURRENT_PASSWORD` (password path), `401 GOOGLE_REAUTH_INVALID` (credential path).
Rate limited (strict).

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

#### POST /auth/google/link
Auth required. Body: `{ "credential": "..." }`. Links a Google identity to the CURRENT account (the
token's email need not match the account's email). Response `200`: `{ "user": {...} }`.
Errors: `501 GOOGLE_SIGNIN_DISABLED`, `401 GOOGLE_EMAIL_NOT_VERIFIED`, `409 GOOGLE_ACCOUNT_ALREADY_LINKED`.
Rate limited (strict, per user).

#### POST /auth/google/unlink
Auth required. Only allowed once the account has a `passwordHash` set (never leave an account with zero
sign-in methods). Response `200`: `{ "user": {...} }`.
Errors: `501 GOOGLE_SIGNIN_DISABLED`, `400 CANNOT_UNLINK_ONLY_METHOD`. Rate limited (strict, per user).

#### POST /auth/set-password
Auth required + header `X-Reauth: <reauthToken>`. Body: `{ "newPassword": "..." }`. Sets/replaces the
account's password (works for a Google-only user setting a password for the first time). `204`.
Errors: `401 REAUTH_REQUIRED`. Rate limited (strict, per user).

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
Body: `{ "familyName": "..." }`. Creates the Family + an owner/admin Membership for the caller + seeds the
default folders and document types (the same seed logic `POST /auth/signup` used to run inline before
multi-family). Response `201`: `{ "family": {...}, "membership": {...} }`. Used by both the first-run
"Create your family" onboarding screen (when `GET /auth/me` returns `memberships: []`) and the family
switcher's "+ Create a new family" action for an existing user.

### GET /family
Auth required. Response:
`{ "id", "name", "slug", "settings": { "activityRetentionDays", "requireReauthForSecrets",
"maxFileMB", "storageLimitMB" }, "storageBytes", "emailEnabled", "storageDriver" }`. `emailEnabled`
reflects whether `SMTP_HOST` is configured. `storageDriver` (`"gridfs"|"s3"|"local"`) is read-only,
straight from env — see `PATCH /family` below for the three settings that ARE editable.
`activityRetentionDays`/`maxFileMB`/`storageLimitMB` are `null` when unset (falling back to the
matching env var — see docs/DECISIONS.md "Operational settings"), not the resolved effective value.

### PATCH /family
Admin. Body: `{ "name"?, "settings"?: { "activityRetentionDays"?, "requireReauthForSecrets"?,
"maxFileMB"?, "storageLimitMB"? } }`. Bounds: `activityRetentionDays` 30–3650,
`maxFileMB` 1–200, `storageLimitMB` >=100. Any of the three set to `null` clears it back to the env
default. `storageDriver` is NOT settable here (env + redeploy only).

### POST /family/test-email
Admin. Sends a test email to the caller. Response `200`: `{ "queued": true, "emailEnabled": boolean }`
(if `emailEnabled` is false, nothing is actually sent — dev logs it instead).

### GET /members
Auth required. Response: `{ "items": [Membership] }` (Membership includes `user.email` when `canLogin`,
`name`, `relation`, `dob`, `role`, `access`, `canLogin`, `isOwner`, `status`: `active|disabled|invited`).

### POST /members
Admin. **Normal shape (what the app's "Add member" form sends): `{ "name", "email" }` — nothing else.**
The person is always **invited**: the Membership is created with `status: "invited"`, `role: "member"`,
`access: "read"` (least privilege — the admin can raise it to `"write"`, and set relation / date of birth,
afterwards via `PATCH /members/:id`), the invite email is queued, and the response carries the invite link
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

Optional extras (API callers/tests — the app's form never sends them): `relation`, `dob`, `access`
(`"read"` default); `sendInvite: false` (still creates the invite and returns its link, but sends no
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
Admin. Body (partial): `{ "name"?, "relation"?, "dob"?, "access"?, "status": "active"|"disabled" }`.
Disabling a member immediately revokes all their refresh tokens.

### POST /members/:id/reset-password
Admin. Body: `{ "newPassword": "..." }`. Revokes all the member's refresh tokens. `204`.

### DELETE /members/:id
Admin. Errors: `400 CANNOT_REMOVE_OWNER`.

---

## Document Types — `/document-types`

### GET /document-types
Auth required. `{ "items": [DocumentType] }`.

### POST /document-types
Admin. Body: `{ "name", "icon", "defaultFolderId"?, "fields": [{ "key", "type", "sensitive" }] }`.

### PATCH /document-types/:id
Admin. Partial body of the same shape.

### DELETE /document-types/:id
Admin.

---

## Folders — `/folders`

### GET /folders/tree
Auth required. Flat list: `{ "items": [{ "id", "name", "parentId", "color", "icon", "documentCount", "folderCount" }] }`.

### GET /folders/browse?folderId=root|<id>
Auth required. `{ "folder": Folder|null, "breadcrumbs": [Folder], "folders": [Folder+counts], "documents": [DocumentSummary] }`.
`folderId=root` (or omitted) means the top level.

### POST /folders
Write. Body: `{ "name", "parentId": "root"|"<id>", "color"?, "icon"? }`.

### PATCH /folders/:id
Write. Body (partial): `{ "name"?, "parentId"?, "color"?, "icon"? }` (parentId change = move).
Errors: `400 CANNOT_MOVE_INTO_DESCENDANT`.

### DELETE /folders/:id
Write. Recursive delete (subfolders + documents + files). Query `?confirm=1` required, otherwise returns
`{ "requiresConfirm": true, "folderCount": n, "documentCount": n, "fileCount": n }` with `200`.

### POST /folders/:id/zip-link
Write/Read (any authenticated member with folder visibility — read-only members can download).
Response: `{ "url": "..." }` — short-lived signed URL streaming a ZIP.

---

## Documents — `/documents`

### GET /documents?q=&folderId=&memberId=&typeId=&tag=&fileKind=&page=&limit=
Auth required. `{ "items": [DocumentSummary], "page", "limit", "total", "totalPages", "itemResults"? }`.
`DocumentSummary`: `{ id, title, folderId, typeId, memberId, tags, expiryDate, fileCount, primaryThumbUrl, updatedAt }`.
`memberId` is either a Membership id (documents tied to that person) or the literal `none` (only
documents with `memberId: null` — the "Shared / family documents" not tied to anyone; this is what
the member-first home's "Shared" tile and the Search page's "Shared (not one person)" filter use).
Omitting it returns everyone's documents. Any other value is `400 VALIDATION_ERROR`.
`itemResults` is present only when `?q=` is set: vault items (logins/records/notes) matching the query, via
the Items module's `searchItems()` (`[]` until that module lands) — lets a single call power global search
across documents and items together.

### GET /documents/:id
Auth required. Full document incl. `customFields` (sensitive values masked, `hasValue: true`, revealed only
via the reveal endpoint), `files` (each with `url`, `thumbUrl`, `downloadUrl`, `label`, `order`, `size`,
`mimeType`), `breadcrumbs`. Logs `document.view` (throttled: once per member per document per 10 min).

### POST /documents
Write. **Multipart** form-data:
- field `data`: JSON string `{ "title", "folderId", "typeId"?, "memberId"?, "tags"?, "notes"?, "expiryDate"?, "customFields"?: [{key,value,type,sensitive}] }`
- field `files`: one or more files
- field `labels`: JSON array of strings, same order/length as `files` (e.g. `["Front","Back"]`)

Response `201`: full Document.
Errors: `400 UNSUPPORTED_FILE_TYPE`, `413 FILE_TOO_LARGE`.

### PATCH /documents/:id
Write. Body (partial, JSON): `{ title?, folderId?, typeId?, memberId?, tags?, notes?, expiryDate?, customFields? }`
(`customFields` replaces the whole array; client sends the full edited list).

### DELETE /documents/:id
Write.

### POST /documents/:id/files
Write. Multipart: `files`, `labels`. Appends files. Response: updated Document.

### PUT /documents/:id/files/:fileId
Write. Multipart: single `file`. Replaces bytes, keeps the label/order/id.

### PATCH /documents/:id/files/:fileId
Write. Body: `{ label?, order? }`.

### DELETE /documents/:id/files/:fileId
Write.

### POST /documents/:id/zip-link
Auth required (any role — read members can download all files of a doc they can see).
Body: `{ "fileIds"? }` (omit = all files). Response: `{ "url": "..." }`.

### GET /documents/:id/activity
Auth required. `{ "items": [Activity] }` (this document only; read-members see only this — no cross-document access).

### GET /documents/:id/fields/:fieldId/reveal
Auth required. When `Family.settings.requireReauthForSecrets` is true (default), also requires header
`X-Reauth: <reauthToken>` from `POST /auth/reauth` — `401 { code: 'REAUTH_REQUIRED' }` otherwise. Response:
`{ "value": "decrypted plaintext" }`. Logs `field.reveal` (the field's `key` only — never the value).
Rate-limited per member.

---

## Files — `/files`

### GET /files/:signedToken
No `Authorization` header needed — the signed token itself is the credential. Query: `?download=1` to force
`Content-Disposition: attachment`. Supports HTTP `Range` for PDFs/video. Streams decrypted bytes.
Logs `file.download` when `download=1`, nothing for inline `view`/`thumb` purposes (avoids log spam from
`<img>` re-renders) beyond the throttled `document.view`.
Errors: `401 INVALID_OR_EXPIRED_FILE_TOKEN`.

---

## Shares — `/shares`

### GET /shares?targetId=&status=
Write (creators/admins manage shares). `{ "items": [Share] }`. `status`: `active|expired|revoked`.
`Share`: `{ id, targetType, targetId, targetLabel, label, expiresAt, allowDownload, includeSensitive,
hasPassword, revokedAt, openCount, downloadCount, lastOpenedAt, createdAt, url }` (`url` reconstructable
client-side from `id`? — **no**: the raw token is only ever returned on create. List/detail responses omit
`url`/token; the UI shows "Copy link" only right after creation, and otherwise shows share metadata + a
"link already shared, revoke and recreate if lost" note).

### POST /shares
Write. Body:
```json
{
  "targetType": "document",
  "targetId": "...",
  "fileIds": ["..."],
  "expiresIn": "24h",
  "allowDownload": true,
  "password": "optional",
  "label": "For bank KYC",
  "includeSensitive": false
}
```
`targetType`: `document | folder | item` (`item` = a vault item from the Items module — see
docs/ITEMS.md). `expiresIn`: `1h|2h|24h|7d|30d|never`. `includeSensitive` (default `false`): when
`true`, sensitive custom-field / vault-item secret values are included in the public share response
instead of masked. Enforced server-side: `includeSensitive:true` REQUIRES `password` to be set and
`expiresIn` to resolve to <=24h (never `never`) — `400 INVALID_SENSITIVE_SHARE` otherwise. Folder shares
(`targetType: 'folder'`) may never set `includeSensitive:true` — `400 FOLDER_SHARE_NO_SENSITIVE`.
Response `201`: `{ ...Share, "url": "https://client/s/<rawtoken>" }` (only time the raw URL is exposed).

### PATCH /shares/:id
Write. Body: `{ "revoke"?: true, "extendTo"?: "ISO date or expiresIn code", "label"? }`.

### DELETE /shares/:id
Write. Hard-delete (alternative to revoke, for cleanup). Owner/admin only.

### GET /shares/:id/access-log
Write. `{ "items": [{ time, ipHash, device, browser, action }] }`.

---

## Public (no auth) — `/public`

### GET /public/shares/:token
Header `X-Share-Password` sent when the share has a password.
Response `200`:
```json
{
  "familyName": "The Singh Family",
  "label": "For bank KYC",
  "targetType": "document",
  "allowDownload": true,
  "expiresAt": "2026-10-01T00:00:00.000Z",
  "document": { "title": "...", "files": [{ "id","label","url","thumbUrl","downloadUrl","mimeType","size" }] }
}
```
or for folder shares: `"folderTree": { "name", "documents": [...], "subfolders": [ recursive... ] }`.
Errors: `401 { code: 'PASSWORD_REQUIRED' }`, `401 { code: 'PASSWORD_INVALID' }` (after 5 failures per
share+IP in 15 min → `429 { code: 'TOO_MANY_ATTEMPTS' }`), `410 { code: 'EXPIRED' }`, `410 { code: 'REVOKED' }`,
`404`.

### POST /public/shares/:token/zip-link
Same header/auth model (password header when the share has one; `410`/`404` per the rules above).
Streams the ZIP directly as the response body (`Content-Type: application/zip`, respects `allowDownload`)
rather than returning `{ "url": "..." }` — unlike the two authenticated zip-link endpoints above, there's no
useful second GET step here (no bearer token to attach either way), so the client just does a POST fetch
and saves the resulting blob. `403` if `allowDownload` is false on the share.

---

## Activity & Stats

### GET /activity?memberId=&action=&from=&to=&cursor=&limit=
Admin or write. `{ "items": [Activity], "nextCursor": "..."|null }`.
`Activity`: `{ id, actorName, action, targetType, targetId, documentId?, folderId?, shareId?, meta, createdAt }`.

### GET /stats
Auth required. Response:
```json
{
  "counts": { "documents": 0, "folders": 0, "members": 0, "activeShares": 0, "storageBytes": 0, "storageLimitBytes": null },
  "itemsByKind": { "login": 0, "record": 0, "note": 0 },
  "recentDocuments": [DocumentSummary],
  "recentActivity": [Activity],
  "expiringSoon": [DocumentSummary],
  "documentsByMember": { "<membershipId>": 0, "none": 0 }
}
```
`documentsByMember` counts active (not-in-bin) documents per member — keys are Membership ids,
plus `none` for documents not tied to any member. A member with no documents is simply absent
(treat a missing key as `0`). Powers the per-person tiles on the home screen.
`itemsByKind` comes from the Items module's `countItemsByKind()` (see
`server/src/modules/items/integration.js`) — `{}` until that module is built.

---

## Items

Non-file vault items — password/login entries, numeric records/IDs, and secure notes — are a
separate module (`server/src/modules/items/**`, model `VaultItem`, routes `/api/items/*`), owned
independently of the document/folder module above. Full contract: **docs/ITEMS.md** (written by
that module's owner). Integration points other modules call into:
`server/src/modules/items/integration.js` (`listItemsInFolder`, `searchItems`, `countItemsByKind`,
`deleteItemsInFolders`, `moveItemsFolderCheck`, `getItemForShare`) — see that file's doc comments.
`GET /browse` includes an `items: []` array alongside `folders`/`documents` once that module fills
in `listItemsInFolder`. Shares support `targetType: 'item'` (above).

---

## Notification preferences — `/me`

### GET /me/notification-prefs
Admin only (only admins receive alert emails). Response `200`: `{ "instant": { [eventKey]: boolean } }`.
Event keys: `member_added`, `member_removed`, `member_disabled`, `member_access_change`,
`invite_accepted`, `share_sensitive`, `share_lockout`, `document_folder_delete`, `failed_logins`,
`new_device_login`, `storage_threshold`. Missing/unset keys default to `true` (on).

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
  "binRetentionDays": number|null,
  "smtp": { "host": string|null, "port": number|null, "secure": boolean|null, "user": string|null,
            "mailFrom": string|null, "hasPassword": boolean },
  "isPlatformOwner"?: boolean }
```
`smtp.*` and top-level `activityRetentionDays` are the RAW stored value (`null` when unset), never
a resolved "effective" one — same convention as `GET /family`'s `settings`. `smtp.passEncrypted`
is never sent; `hasPassword` says whether one is currently stored. `isPlatformOwner` is present
only when called with a valid bearer token, omitted entirely for an anonymous caller.

### PATCH /platform-settings
Auth required. Only the user whose email matches env `PLATFORM_OWNER_EMAIL` may write (everyone
else gets `403 FORBIDDEN` — there's no platform-super-admin role in the data model, identity is
env-configured). Body (partial, any subset):
```
{ "allowedLoginMethods"?: "google"|"password"|"both",
  "activityRetentionDays"?: number|null,
  "binRetentionDays"?: number|null,
  "smtp"?: { "host"?: string|null, "port"?: number|null, "secure"?: boolean|null, "user"?: string|null,
             "mailFrom"?: string|null, "pass"?: string|null } }
```
Response: same shape as `GET` (minus `isPlatformOwner`).

Enforcement: `allowedLoginMethods` gates `POST /auth/signup`/`login` (rejected with
`403 { code: 'LOGIN_METHOD_NOT_ALLOWED' }` when set to `'google'`) and `POST /auth/google`/
`google/complete` (same error when set to `'password'`) — checked at the top of each endpoint, a
simple global gate, not tied to sessions or families. Unrelated to a Membership's own
`loginMethod` field (docs/API.md's `POST /members`), which still governs how one already-added
member is expected to sign in — this setting is a blunt on/off switch sitting above all of that.

`activityRetentionDays` (nullable, `30`–`3650`): the deployment-wide DEFAULT used when a family
hasn't set its own `Family.settings.activityRetentionDays` override. Resolution order: per-family
override -> this platform default -> env `ACTIVITY_RETENTION_DAYS` (final fallback). See
`server/src/utils/effectiveSettings.js` and docs/DECISIONS.md "Operational settings".

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
{ "items": [{ "id": string, "type": "document"|"folder"|"item", "name": string,
              "familyId": string, "deletedAt": string }] }
```

### POST /platform-settings/bin/purge
Auth required, platform-owner only (`403 FORBIDDEN` for anyone else). Body:
```
{ "items": [{ "type": "document"|"folder"|"item", "id": string }] }
```
Permanently removes each listed entry — the DB row(s) and, for a document/folder, its stored
files (`storage.delete()`). This is the **only** route in the app that ever does either of those
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
This family's whole bin, newest-deleted first, across all three types.
```
{ "items": [{ "id": string, "type": "document"|"folder"|"item", "name": string,
              "deletedAt": string }] }
```

### POST /bin/:type/:id/restore
`:type` is `document`, `folder`, or `item`. Clears `deletedAt` on the entry. Restoring a
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

---

## Module ownership (for this build only — remove before shipping if stale)

- Agent A (identity): `/auth` (incl. `/auth/reauth`), `/members`, `/family`, `/document-types`
- Agent B (content): `/folders`, `/documents`, `/files` — calls into `modules/items/integration.js`
  for `GET /browse`'s `items[]`, search, and recursive folder delete
- Agent C (sharing/audit): `/shares`, `/public`, `/activity`, `/stats` — `targetType: 'item'` shares
  and `includeSensitive` rules call `modules/items/integration.js#getItemForShare`
- Items module owner (separate from A/B/C): `/items`, model `VaultItem`, docs/ITEMS.md
