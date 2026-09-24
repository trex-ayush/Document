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

- **Access token**: JWT, 15 min expiry, `{ sub: userId, membershipId, familyId, role, access }`.
  Sent as `Authorization: Bearer`.
- **Refresh token**: opaque random string (not a JWT), 30 day expiry. Returned in the body of
  signup/login/refresh responses. The client stores it (localStorage) and POSTs it to `/auth/refresh` and
  `/auth/logout`. The server stores only `sha256(token)` in `RefreshToken.tokenHash`, and **rotates** it
  (issues a new one, marks the old `revokedAt` + `replacedBy`) on every refresh. Reuse of a revoked token
  revokes the whole chain (theft detection).
- **File token**: short-lived JWT (1 hour), `{ fileId, familyId, purpose: 'view'|'thumb'|'download', kind }`,
  embedded as a query param in `url`/`thumbUrl`/`downloadUrl` so `<img src>` and mobile download work
  without custom headers. Verified by `GET /files/:signedToken`.

## Roles

- `role`: `admin` | `member` (on the Membership). `isOwner: true` marks the never-removable creator.
- `access`: `read` | `write` (ignored for admins, who always have full access).
- Middleware: `requireAuth` (valid access token + active membership), `requireWrite` (role admin OR
  access write), `requireAdmin` (role admin).

---

## Auth — `/auth`

### POST /auth/signup
Public. Creates a new Family + the first User (super admin) + seeds default folders and document types.

Request:
```json
{
  "familyName": "The Singh Family",
  "name": "Ayush Singh",
  "email": "ayush@example.com",
  "password": "Str0ngPass!"
}
```
Response `201`:
```json
{
  "user": { "id": "...", "name": "Ayush Singh", "email": "ayush@example.com", "avatarColor": "#FF5A5F" },
  "membership": { "id": "...", "familyId": "...", "role": "admin", "access": "write", "isOwner": true },
  "family": { "id": "...", "name": "The Singh Family", "slug": "the-singh-family" },
  "accessToken": "eyJ...",
  "refreshToken": "base64url..."
}
```
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
Auth required. Response: `{ "user": {...}, "membership": {...}, "family": {...} }`.

### PATCH /auth/me
Auth required. Body (partial): `{ "name": "...", "avatarColor": "#..." }`. Returns updated `user`.

### POST /auth/change-password
Auth required. Body: `{ "currentPassword": "...", "newPassword": "..." }`. `204`.
Errors: `401 INVALID_CURRENT_PASSWORD`.

### POST /auth/reauth
Auth required. Body: `{ "password": "..." }`. Verifies the caller's current password and returns a
short-lived (5 min) capability: `{ "reauthToken": "..." }`. Sent back as the `X-Reauth` header on any
endpoint that reveals a sensitive value (`GET /documents/:id/fields/:fieldId/reveal`, and the Items
module's reveal endpoint — see docs/ITEMS.md) when `Family.settings.requireReauthForSecrets` is true
(the default; an admin can turn it off in Settings). Logs `auth.reauth`.
Errors: `401 INVALID_CURRENT_PASSWORD`. Rate limited (strict).

---

## Family & Members

### GET /family
Auth required. Response:
`{ "id", "name", "slug", "settings": { "activityRetentionDays", "requireReauthForSecrets" }, "storageBytes" }`.

### PATCH /family
Admin. Body: `{ "name"?, "settings"?: { "activityRetentionDays"?, "requireReauthForSecrets"? } }`.

### GET /members
Auth required. Response: `{ "items": [Membership] }` (Membership includes `user.email` when `canLogin`,
`name`, `relation`, `dob`, `role`, `access`, `canLogin`, `isOwner`, `status`).

### POST /members
Admin. Two shapes:
- Login-enabled: `{ "name", "relation", "dob"?, "email", "tempPassword", "access": "read"|"write" }`
- Profile-only: `{ "name", "relation", "dob"?, "canLogin": false }`

Response `201`: the created Membership.
Errors: `409 EMAIL_TAKEN`.

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

### GET /browse?folderId=root|<id>
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
  "expiringSoon": [DocumentSummary]
}
```
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
