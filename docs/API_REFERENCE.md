# Family Vault — API reference

Every endpoint of the Family Vault server, with its parameters, body fields, an example
response and the errors it can return. **Click an endpoint to open its details.**

Back to the [README](../README.md).

## Contents

- [Basics](#basics) — base URL, signing in, the `X-Family-Id` header, errors, limits, paging
- Endpoints
  - [Health](#health) (2)
  - [Auth](#auth) (15)
  - [Notification settings](#notification-settings) (2)
  - [Family](#family) (4)
  - [Members](#members) (7)
  - [Folders](#folders) (6)
  - [Documents](#documents) (10)
  - [Files](#files) (2)
  - [Passwords and notes](#passwords-and-notes) (6)
  - [Search](#search) (1)
  - [Share links](#share-links) (5)
  - [Public share pages](#public-share-pages) (2)
  - [Bin](#bin) (2)
  - [Activity](#activity) (1)
  - [Stats](#stats) (1)
  - [Platform settings](#platform-settings) (5)
  - [Admin panel](#admin-panel) (15)
- [Examples](#examples) — `curl` for the most common calls

## Basics

**Base URL.** `http://localhost:5000/api` on your computer. In production it is the Render API
service's address followed by `/api` (the same value as the client's `VITE_API_URL`).

**Request bodies.** JSON (`Content-Type: application/json`, up to 1 MB). File uploads use
`multipart/form-data`. Ids are 24-character strings. Dates are ISO 8601 (UTC).

**Signing in.**

- `POST /auth/login` (or signup, Google, accept-invite) returns `{ user, memberships, accessToken, refreshToken }`.
- Send the access token on every protected call: `Authorization: Bearer <accessToken>`. It lasts 15 minutes.
- The refresh token is returned **in the JSON body** (there is no cookie). The app keeps it in the
  browser's local storage. When the access token expires, call `POST /auth/refresh` with
  `{ "refreshToken": "..." }` to get a new pair. Each refresh token works once and stays valid for
  60 minutes of inactivity; after that the answer is `401 SESSION_EXPIRED` and the person signs in again.
- `POST /auth/logout` takes the same `{ refreshToken }` body.

**Choosing a family: the `X-Family-Id` header.** One account can belong to several families. The
access token only says *who* you are; the `X-Family-Id: <familyId>` header says *which family* the
request is for. Take the id from `memberships[].familyId` in the login or `GET /auth/me` response.

- **Needed on:** `/members`, `/folders`, `/documents`, `/items`, `/search`, `/shares`, `/bin`,
  `/activity`, `/stats`, `/me`, and every `/family` route except `POST /family`.
- **Not needed on:** `/auth/*`, `POST /family`, `/platform-settings`, `/admin`, `/public`, `/files`
  and `/health`.
- Missing header → `400 MISSING_FAMILY_ID`. A family you are not an active member of → `403 NOT_A_MEMBER`.

**Who can call** (used in every endpoint below):

| Label | Meaning |
| --- | --- |
| public | no token needed |
| signed in | a valid access token |
| family member | signed in + `X-Family-Id` of a family you are an active member of (read access is enough) |
| write access | family member with `access: write`, or a family admin |
| family admin | family member with `role: admin` |
| platform admin | signed in as the super admin or as an admin added in Admin → Admins |
| super admin | signed in as the `SUPER_ADMIN_EMAIL` account |

**Errors.** Every error has the same shape and a matching HTTP status:

```json
{ "message": "Human readable text", "code": "MACHINE_CODE", "details": { } }
```

`details` is only there when there is something to add. For `400 VALIDATION_ERROR` it holds the
field problems (`{ formErrors, fieldErrors }`). The codes you will meet most:

| Status | Codes |
| --- | --- |
| 400 | `VALIDATION_ERROR`, `MISSING_FAMILY_ID`, `SYSTEM_FOLDER` (the Shared folder can't be renamed, moved or deleted), `RESERVED_FOLDER_NAME`, `LAST_FILE` (a document keeps at least one file), `CANNOT_REMOVE_OWNER`, `LAST_ADMIN`, `INVALID_OR_EXPIRED_TOKEN` (reset or invite link) |
| 401 | `UNAUTHENTICATED` (no token), `INVALID_TOKEN` (bad or expired access token — refresh it), `SESSION_EXPIRED`, `SESSION_REVOKED`, `INVALID_REFRESH_TOKEN`, `INVALID_CREDENTIALS`, `INVALID_OR_EXPIRED_FILE_TOKEN` |
| 403 | `FORBIDDEN` (needs write or admin), `NOT_A_MEMBER`, `ACCOUNT_DISABLED`, `LOGIN_METHOD_NOT_ALLOWED`, `NOT_PLATFORM_ADMIN`, `SUPER_ADMIN_ONLY`, `SUPER_ADMIN_PROTECTED`, `CANNOT_MODIFY_SELF` |
| 404 | `NOT_FOUND` (also any unknown route), `FOLDER_NOT_FOUND`, `DOCUMENT_NOT_FOUND`, `ITEM_NOT_FOUND`, `FILE_NOT_FOUND`, `NOT_IN_BIN` |
| 409 | `DUPLICATE`, `EMAIL_TAKEN`, `ALREADY_MEMBER`, `ALREADY_ADMIN`, `IS_SUPER_ADMIN` |
| 410 | `EXPIRED`, `REVOKED` (public share links) |
| 413 | `FILE_TOO_LARGE`, `PAYLOAD_TOO_LARGE` |
| 429 | `RATE_LIMITED` |
| 500 / 501 | `INTERNAL_ERROR` / `GOOGLE_SIGNIN_DISABLED` (no `GOOGLE_CLIENT_ID` set) |

**Rate limits.** Counted per IP address unless noted. Going over returns `429`.

| Applies to | Limit |
| --- | --- |
| everything under `/api` | 300 requests per minute |
| `/auth/*` (except `/auth/me`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`) | 20 per 15 minutes |
| `POST /auth/login` | 10 per 15 minutes per IP + email |
| `POST /auth/signup` | 10 per hour |
| `POST /auth/google`, `POST /auth/google/complete` | 10 per 15 minutes |
| `POST /auth/set-password` | 10 per 15 minutes per user |
| `POST /auth/forgot-password`, `/auth/reset-password`, `/auth/accept-invite` | 5 per 15 minutes per IP + email |
| `/public/*` | 60 per 15 minutes |
| `POST /members/:id/invite-link`, `/members/:id/resend-invite` | 30 per 15 minutes per member |

The per-route limits answer with `{ message, code: "RATE_LIMITED" }`; the general ones answer with a
plain-text message.

**Lists and pagination.** Three styles are used:

- **Page numbers** — `GET /documents` and `GET /items` take `page` (from 1) and `limit` (default 20,
  max 100) and return `{ items, page, limit, total, totalPages }`. The admin lists (`/admin/users`,
  `/admin/families`, `/admin/shares`) return `{ items, total, page, limit }`; a `limit` above 100 is
  cut to 100.
- **Cursor** — `GET /activity` (default 20, max 100) and `GET /admin/activity` (default 50, cut to
  100) return `{ items, nextCursor }`. Pass `nextCursor` back as `?cursor=` for the next page. `null`
  means there is nothing more.
- **Everything at once** — the other lists return `{ items }` with no paging.

**Filters with several values.** Some filters take a comma-separated list, and a matching `…Not`
filter leaves values out: `?memberId=a,b&memberIdNot=c` means "by member a or b, but not c". Up to
100 values per filter; a single value works too. Used by `GET /activity` (`memberId`, `action`) and
`GET /admin/activity` (`familyId`, `action`).

**Uploads.** `POST /documents` and `POST /documents/:id/files` take `multipart/form-data` with 1 to 20
`files`. Allowed: JPEG, PNG, WebP, HEIC/HEIF (turned into JPEG) and PDF. The largest file is the
platform's `maxFileMB` setting (starts at `MAX_FILE_MB`, 20 MB). Optional fields: `labels` and
`texts`, each a JSON array in the same order as `files`.

**File links.** Documents come back with short-lived signed links (`url`, `thumbUrl`,
`downloadUrl`) that work without a header, so they can go straight into `<img src>`. They last one
hour. ZIP links last five minutes.

---

## Health

Two tiny routes that say the server is running (used by Render's health check and uptime monitors).

<details>
<summary><code>GET /health</code> — Check that the server is up (no <code>/api</code> prefix)</summary>

**Who can call:** public · **Rate limit:** none (it sits outside `/api`)

**Headers:** none

**Path parameters:** none

**Query parameters:** none

**Body:** none

**Response** `200 OK`

```json
{
  "status": "ok",
  "uptime": 5231.42
}
```

`uptime` is how many seconds the server process has been running.

**Errors:** none — if the server is up, this always answers `200`.

</details>

<details>
<summary><code>GET /api/health</code> — Check that the server is up (Render's health-check path)</summary>

**Who can call:** public · **Rate limit:** general limit (300 per minute per IP)

**Headers:** none

**Path parameters:** none

**Query parameters:** none

**Body:** none

**Response** `200 OK`

```json
{
  "status": "ok",
  "uptime": 5231.42
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 429 | — (plain-text body) | more than 300 requests to `/api` in one minute from this IP |

</details>

---

## Auth

Create an account, sign in and out, keep a session alive, manage your own profile and password, Google sign-in, password reset and invite acceptance. None of these routes need `X-Family-Id`.

**Base path:** `/auth`

<details>
<summary><code>POST /auth/signup</code> — Create an account with email and password</summary>

**Who can call:** public · **Rate limit:** 10 signups per hour per IP; also the `/auth` limit (20 per 15 min per IP) and the general limit (300 per min per IP)

**Headers:** `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `name` | string | yes | trimmed, 1–100 characters |
| `email` | string | yes | trimmed, a valid email; saved in lower case |
| `password` | string | yes | 8–128 characters |

No family is created here. Any pending invite for this email is joined at once and shows up in `memberships`. An empty `memberships` means the app should offer "Create your family" (`POST /family`).

**Response** `201 Created`

```json
{
  "user": {
    "id": "66f0c1a2b3c4d5e6f7a8b9c0",
    "name": "Asha Singh",
    "email": "asha@example.com",
    "avatarUrl": null,
    "authProviders": ["password"],
    "avatarColor": "#FF5A5F",
    "language": null,
    "lastLoginAt": "2026-09-27T10:15:00.000Z",
    "disabled": false,
    "sessionsRevokedAt": null,
    "createdAt": "2026-09-27T10:15:00.000Z",
    "updatedAt": "2026-09-27T10:15:00.000Z"
  },
  "memberships": [],
  "accessToken": "eyJ…",
  "refreshToken": "Xk3v…"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a field is missing or invalid, or an unknown field was sent |
| 403 | `LOGIN_METHOD_NOT_ALLOWED` | the platform only allows Google sign-in |
| 409 | `EMAIL_TAKEN` | an account with this email already exists |
| 429 | `RATE_LIMITED` | more than 10 signups from this IP in an hour |
| 429 | — (plain-text body) | over the `/auth` or general limit |

</details>

<details>
<summary><code>POST /auth/login</code> — Sign in with email and password</summary>

**Who can call:** public · **Rate limit:** 10 per 15 min per IP + email; also the `/auth` limit (20 per 15 min per IP) and the general limit (300 per min per IP)

**Headers:** `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `email` | string | yes | trimmed, a valid email (matched in lower case) |
| `password` | string | yes | at least 1 character |

Pending invites for this email are joined first, so `memberships` is the full, current list of active families.

**Response** `200 OK`

```json
{
  "user": {
    "id": "66f0c1a2b3c4d5e6f7a8b9c0",
    "name": "Asha Singh",
    "email": "asha@example.com",
    "avatarUrl": null,
    "authProviders": ["password"],
    "avatarColor": "#FF5A5F",
    "language": "hi",
    "lastLoginAt": "2026-09-27T10:15:00.000Z",
    "disabled": false,
    "sessionsRevokedAt": null,
    "createdAt": "2026-08-01T09:00:00.000Z",
    "updatedAt": "2026-09-27T10:15:00.000Z"
  },
  "memberships": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c2",
      "familyId": "66f0c1a2b3c4d5e6f7a8b9c1",
      "familyName": "The Singh Family",
      "role": "admin",
      "access": "write",
      "isOwner": true,
      "status": "active"
    }
  ],
  "accessToken": "eyJ…",
  "refreshToken": "Xk3v…"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | email or password missing or invalid, or an unknown field was sent |
| 401 | `INVALID_CREDENTIALS` | wrong email or password (also for a Google-only account with no password) |
| 403 | `LOGIN_METHOD_NOT_ALLOWED` | the platform only allows Google sign-in |
| 403 | `ACCOUNT_DISABLED` | the account has been disabled |
| 429 | `RATE_LIMITED` | more than 10 attempts for this IP + email in 15 minutes |
| 429 | — (plain-text body) | over the `/auth` or general limit |

</details>

<details>
<summary><code>POST /auth/refresh</code> — Swap a refresh token for a new token pair</summary>

**Who can call:** public (the refresh token in the body is the credential) · **Rate limit:** general limit only (300 per min per IP)

**Headers:** `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `refreshToken` | string | yes | at least 1 character |

Each refresh token works once. The new one is valid for another 60 minutes of inactivity. Re-using an already-used token signs out the whole session chain (theft protection).

**Response** `200 OK`

```json
{
  "accessToken": "eyJ…",
  "refreshToken": "Pq9w…"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `refreshToken` missing, or an unknown field was sent |
| 401 | `INVALID_REFRESH_TOKEN` | unknown token, an already-used token (the session is then revoked), or the account is gone or disabled |
| 401 | `SESSION_EXPIRED` | the token went unused for more than 60 minutes |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /auth/logout</code> — Sign out this session</summary>

**Who can call:** public (access token optional) · **Rate limit:** general limit only (300 per min per IP)

**Headers:** `Content-Type: application/json`; `Authorization: Bearer <accessToken>` is optional — when a valid one is sent, the sign-out is recorded in the activity log

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `refreshToken` | string | yes | at least 1 character; the token to revoke |

Safe to call more than once: an unknown or already-revoked token is simply ignored. A bad or expired access token does not cause an error here.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `refreshToken` missing, or an unknown field was sent |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /auth/logout-all</code> — Sign out on every device</summary>

**Who can call:** signed in · **Rate limit:** general limit only (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

Revokes every refresh token and makes access tokens already handed out stop working on their next request.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad, expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was already signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>GET /auth/me</code> — Get your account and every family you belong to</summary>

**Who can call:** signed in · **Rate limit:** general limit only (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>` (no `X-Family-Id` needed)

**Path parameters:** none

**Query parameters:** none

**Body:** none

**Response** `200 OK`

```json
{
  "user": {
    "id": "66f0c1a2b3c4d5e6f7a8b9c0",
    "name": "Asha Singh",
    "email": "asha@example.com",
    "avatarUrl": null,
    "authProviders": ["password"],
    "avatarColor": "#FF5A5F",
    "language": "en",
    "lastLoginAt": "2026-09-27T10:15:00.000Z",
    "disabled": false,
    "sessionsRevokedAt": null,
    "createdAt": "2026-08-01T09:00:00.000Z",
    "updatedAt": "2026-09-27T10:15:00.000Z"
  },
  "memberships": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c2",
      "familyId": "66f0c1a2b3c4d5e6f7a8b9c1",
      "familyName": "The Singh Family",
      "role": "admin",
      "access": "write",
      "isOwner": true,
      "status": "active"
    }
  ]
}
```

Only active memberships are listed, owned families first.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad, expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 404 | `NOT_FOUND` | the account was deleted during the request (rare) |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>PATCH /auth/me</code> — Update your name, colour or language</summary>

**Who can call:** signed in · **Rate limit:** general limit only (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json` (no `X-Family-Id` needed)

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, send at least one field; unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `name` | string | no | trimmed, 1–100 characters |
| `avatarColor` | string | no | hex colour `#RRGGBB`, e.g. `#FF5A5F` |
| `language` | string | no | `en` or `hi` |

**Response** `200 OK`

```json
{
  "user": {
    "id": "66f0c1a2b3c4d5e6f7a8b9c0",
    "name": "Asha Singh",
    "email": "asha@example.com",
    "avatarUrl": null,
    "authProviders": ["password"],
    "avatarColor": "#2A9D8F",
    "language": "hi",
    "lastLoginAt": "2026-09-27T10:15:00.000Z",
    "disabled": false,
    "sessionsRevokedAt": null,
    "createdAt": "2026-08-01T09:00:00.000Z",
    "updatedAt": "2026-09-27T10:20:00.000Z"
  }
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | empty body, an invalid value, or an unknown field |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 404 | `NOT_FOUND` | the account was deleted during the request (rare) |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /auth/change-password</code> — Change your password</summary>

**Who can call:** signed in · **Rate limit:** `/auth` limit (20 per 15 min per IP) and the general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `currentPassword` | string | yes | at least 1 character |
| `newPassword` | string | yes | 8–128 characters |

Signs the account out on every device (other sessions must sign in again) and emails a "your password was changed" notice.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a field is missing or invalid, or an unknown field was sent |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 401 | `INVALID_CURRENT_PASSWORD` | the current password is wrong, or the account has no password yet (use `/auth/set-password`) |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 404 | `NOT_FOUND` | the account was deleted during the request (rare) |
| 429 | — (plain-text body) | over the `/auth` or general limit |

</details>

<details>
<summary><code>POST /auth/google</code> — Sign in, or start signing up, with Google</summary>

**Who can call:** public · **Rate limit:** 10 per 15 min per IP; also the `/auth` limit (20 per 15 min per IP) and the general limit (300 per min per IP)

**Headers:** `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `credential` | string | yes | the Google ID token from the Google sign-in button; its email must be verified by Google |

Finds the account by Google id, then by email (linking Google to that account on first use). If no account exists, nothing is created: you get a `signupToken` to pass to `POST /auth/google/complete`.

**Response** `200 OK` — existing account (same session shape as login, plus `needsSignup: false`):

```json
{
  "needsSignup": false,
  "user": {
    "id": "66f0c1a2b3c4d5e6f7a8b9c0",
    "name": "Asha Singh",
    "email": "asha@example.com",
    "googleId": "109876543210987654321",
    "avatarUrl": "https://lh3.googleusercontent.com/a/…",
    "authProviders": ["password", "google"],
    "avatarColor": "#FF5A5F",
    "language": "en",
    "lastLoginAt": "2026-09-27T10:15:00.000Z",
    "disabled": false,
    "sessionsRevokedAt": null,
    "createdAt": "2026-08-01T09:00:00.000Z",
    "updatedAt": "2026-09-27T10:15:00.000Z"
  },
  "memberships": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c2",
      "familyId": "66f0c1a2b3c4d5e6f7a8b9c1",
      "familyName": "The Singh Family",
      "role": "admin",
      "access": "write",
      "isOwner": true,
      "status": "active"
    }
  ],
  "accessToken": "eyJ…",
  "refreshToken": "Xk3v…"
}
```

`200 OK` — no account yet (the `signupToken` lasts 10 minutes):

```json
{
  "needsSignup": true,
  "signupToken": "eyJ…",
  "profile": {
    "name": "Asha Singh",
    "email": "asha@example.com",
    "avatarUrl": "https://lh3.googleusercontent.com/a/…"
  }
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `credential` missing, or an unknown field was sent |
| 401 | `GOOGLE_TOKEN_INVALID` | Google rejected the credential, or it expired |
| 401 | `GOOGLE_EMAIL_NOT_VERIFIED` | the Google account's email is not verified |
| 403 | `LOGIN_METHOD_NOT_ALLOWED` | the platform only allows password sign-in |
| 403 | `ACCOUNT_DISABLED` | the matching account has been disabled |
| 429 | `RATE_LIMITED` | more than 10 Google attempts from this IP in 15 minutes |
| 429 | — (plain-text body) | over the `/auth` or general limit |
| 501 | `GOOGLE_SIGNIN_DISABLED` | the server has no `GOOGLE_CLIENT_ID` set |

</details>

<details>
<summary><code>POST /auth/google/complete</code> — Finish a new Google signup</summary>

**Who can call:** public · **Rate limit:** 10 per 15 min per IP; also the `/auth` limit (20 per 15 min per IP) and the general limit (300 per min per IP)

**Headers:** `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `signupToken` | string | yes | the `signupToken` from `POST /auth/google` (valid 10 minutes) |

Creates a Google-only account (no password) from the verified Google profile, joins any pending invites for that email, and signs in. No family is created.

**Response** `201 Created`

```json
{
  "user": {
    "id": "66f0c1a2b3c4d5e6f7a8b9c0",
    "name": "Asha Singh",
    "email": "asha@example.com",
    "googleId": "109876543210987654321",
    "avatarUrl": "https://lh3.googleusercontent.com/a/…",
    "authProviders": ["google"],
    "avatarColor": "#FF5A5F",
    "language": null,
    "lastLoginAt": "2026-09-27T10:15:00.000Z",
    "disabled": false,
    "sessionsRevokedAt": null,
    "createdAt": "2026-09-27T10:15:00.000Z",
    "updatedAt": "2026-09-27T10:15:00.000Z"
  },
  "memberships": [],
  "accessToken": "eyJ…",
  "refreshToken": "Xk3v…"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `signupToken` missing, or an unknown field was sent |
| 401 | `SIGNUP_TOKEN_INVALID` | the signup token is bad, expired, or not a signup token |
| 403 | `LOGIN_METHOD_NOT_ALLOWED` | the platform only allows password sign-in |
| 409 | `EMAIL_TAKEN` | an account with this email was created in the meantime |
| 429 | `RATE_LIMITED` | more than 10 Google attempts from this IP in 15 minutes |
| 429 | — (plain-text body) | over the `/auth` or general limit |
| 501 | `GOOGLE_SIGNIN_DISABLED` | the server has no `GOOGLE_CLIENT_ID` set |

</details>

<details>
<summary><code>POST /auth/set-password</code> — Add a first password to a Google-only account</summary>

**Who can call:** signed in · **Rate limit:** 10 per 15 min per user; also the `/auth` limit (20 per 15 min per IP) and the general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `newPassword` | string | yes | 8–128 characters |

Only for an account that has no password yet. An account that already has one must use `POST /auth/change-password`.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `newPassword` missing or too short/long, or an unknown field was sent |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 404 | `NOT_FOUND` | the account was deleted during the request (rare) |
| 409 | `PASSWORD_ALREADY_SET` | the account already has a password |
| 429 | `RATE_LIMITED` | more than 10 attempts by this user in 15 minutes |
| 429 | — (plain-text body) | over the `/auth` or general limit |

</details>

<details>
<summary><code>POST /auth/forgot-password</code> — Email a password reset link</summary>

**Who can call:** public · **Rate limit:** 5 per 15 min per IP + email; also the `/auth` limit (20 per 15 min per IP) and the general limit (300 per min per IP)

**Headers:** `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `email` | string | yes | trimmed, a valid email |

Always gives the same answer, so it never reveals whether an account exists. When the account exists and is not disabled, a reset link (`<CLIENT_URL>/reset-password?token=…`, single use, valid 30 minutes) is emailed.

**Response** `200 OK`

```json
{
  "message": "If an account with that email exists, we've sent a password reset link."
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `email` missing or invalid, or an unknown field was sent |
| 403 | `LOGIN_METHOD_NOT_ALLOWED` | the platform only allows Google sign-in |
| 429 | `RATE_LIMITED` | more than 5 requests for this IP + email in 15 minutes |
| 429 | — (plain-text body) | over the `/auth` or general limit |

</details>

<details>
<summary><code>POST /auth/reset-password</code> — Set a new password from an emailed reset link</summary>

**Who can call:** public · **Rate limit:** 5 per 15 min per IP (one counter shared with `POST /auth/accept-invite`); also the `/auth` limit (20 per 15 min per IP) and the general limit (300 per min per IP)

**Headers:** `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `token` | string | yes | the `token` from the reset link |
| `newPassword` | string | yes | 8–128 characters |

Sets the password (also turns on password sign-in for a Google-only account), uses up the link, signs the account out on every device and emails a "password changed" notice.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a field is missing or invalid, or an unknown field was sent |
| 400 | `INVALID_OR_EXPIRED_TOKEN` | the link is unknown, already used, or older than 30 minutes |
| 403 | `LOGIN_METHOD_NOT_ALLOWED` | the platform only allows Google sign-in |
| 429 | `RATE_LIMITED` | too many reset requests from this IP in 15 minutes |
| 429 | — (plain-text body) | over the `/auth` or general limit |

</details>

<details>
<summary><code>GET /auth/accept-invite/:token</code> — Look up an invite link before accepting it</summary>

**Who can call:** public · **Rate limit:** `/auth` limit (20 per 15 min per IP) and the general limit (300 per min per IP)

**Headers:** none

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `token` | string | the `token` from the invite link |

**Query parameters:** none

**Body:** none

`accountExists: true` means the invited email already has an account: the app should show "Sign in to join" instead of a set-password form. `allowsGoogle` says whether to offer Google.

**Response** `200 OK`

```json
{
  "email": "ravi@example.com",
  "familyName": "The Singh Family",
  "allowsGoogle": true,
  "accountExists": false
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | the token is empty |
| 400 | `INVALID_OR_EXPIRED_TOKEN` | the link is unknown, already used, replaced by a newer link, older than 7 days, or the invite was removed |
| 429 | — (plain-text body) | over the `/auth` or general limit |

</details>

<details>
<summary><code>POST /auth/accept-invite</code> — Accept an invite by setting a password</summary>

**Who can call:** public · **Rate limit:** 5 per 15 min per IP (one counter shared with `POST /auth/reset-password`); also the `/auth` limit (20 per 15 min per IP) and the general limit (300 per min per IP)

**Headers:** `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `token` | string | yes | the `token` from the invite link |
| `password` | string | no in the schema, but needed to succeed | 8–128 characters; without it the answer is `400 PASSWORD_REQUIRED` |

Only for a brand-new person (no account yet for the invited email). Creates the account with this password, joins this family and any other pending invite for the same email, and signs in. Someone who prefers Google can skip this and use `POST /auth/google` with the invited email instead.

**Response** `200 OK`

```json
{
  "user": {
    "id": "66f0c1a2b3c4d5e6f7a8b9d0",
    "name": "Ravi Singh",
    "email": "ravi@example.com",
    "avatarUrl": null,
    "authProviders": ["password", "google"],
    "avatarColor": "#FF5A5F",
    "language": null,
    "lastLoginAt": "2026-09-27T10:15:00.000Z",
    "disabled": false,
    "sessionsRevokedAt": null,
    "createdAt": "2026-09-27T10:15:00.000Z",
    "updatedAt": "2026-09-27T10:15:00.000Z"
  },
  "memberships": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9d1",
      "familyId": "66f0c1a2b3c4d5e6f7a8b9c1",
      "familyName": "The Singh Family",
      "role": "member",
      "access": "write",
      "isOwner": false,
      "status": "active"
    }
  ],
  "accessToken": "eyJ…",
  "refreshToken": "Xk3v…"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `token` missing, `password` too short/long, or an unknown field was sent |
| 400 | `INVALID_OR_EXPIRED_TOKEN` | the link is unknown, used, replaced, expired (7 days) or the invite was removed |
| 400 | `PASSWORD_REQUIRED` | no `password` was sent |
| 403 | `LOGIN_METHOD_NOT_ALLOWED` | the platform only allows Google sign-in |
| 409 | `ALREADY_ACCEPTED` | this invite was already accepted |
| 409 | `ACCOUNT_EXISTS` | an account already exists for this email — sign in instead (the invite is joined automatically) |
| 429 | `RATE_LIMITED` | too many requests from this IP in 15 minutes |
| 429 | — (plain-text body) | over the `/auth` or general limit |

</details>

---

## Notification settings

Which alert emails a family admin receives for the selected family (only admins get alert emails).

**Base path:** `/me`

<details>
<summary><code>GET /me/notification-prefs</code> — Get your alert email settings</summary>

**Who can call:** family admin · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

Only keys you have changed are listed; a missing key means that alert is **on**. Known keys: `member_added`, `member_removed`, `member_disabled`, `member_access_change`, `invite_accepted`, `document_folder_delete`, `failed_logins`, `new_device_login`.

**Response** `200 OK`

```json
{
  "instant": {
    "member_added": true,
    "failed_logins": false
  }
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | not a family admin |
| 404 | `NOT_FOUND` | the membership was removed during the request (rare) |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>PATCH /me/notification-prefs</code> — Turn alert emails on or off</summary>

**Who can call:** family admin · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `instant` | object of `{ key: boolean }` | yes | only the keys you want to change; they are merged into your saved settings. Keys as listed in `GET /me/notification-prefs` |

**Response** `200 OK` — the full, merged settings:

```json
{
  "instant": {
    "member_added": true,
    "failed_logins": false,
    "new_device_login": false
  }
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `instant` missing, a value is not true/false, or an unknown field was sent |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | not a family admin |
| 404 | `NOT_FOUND` | the membership was removed during the request (rare) |
| 429 | — (plain-text body) | over the general limit |

</details>

---

## Family

Create a family, read its details and change its settings.

**Base path:** `/family`

<details>
<summary><code>POST /family</code> — Create a new family</summary>

**Who can call:** signed in · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json` (no `X-Family-Id` — this is how you get a family)

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `familyName` | string | yes | trimmed, 1–150 characters |

You become the family's owner and admin with write access. The family's Shared folder is created too. The `slug` is made from the name and kept unique (`singh-family`, `singh-family-2`, …).

**Response** `201 Created`

```json
{
  "family": {
    "id": "66f0c1a2b3c4d5e6f7a8b9c1",
    "name": "The Singh Family",
    "slug": "the-singh-family",
    "createdBy": "66f0c1a2b3c4d5e6f7a8b9c0",
    "settings": { "defaultShareDuration": "12h" },
    "storageBytes": 0,
    "createdAt": "2026-09-27T10:16:00.000Z",
    "updatedAt": "2026-09-27T10:16:00.000Z",
    "defaultShareDuration": "12h"
  },
  "membership": {
    "id": "66f0c1a2b3c4d5e6f7a8b9c2",
    "familyId": "66f0c1a2b3c4d5e6f7a8b9c1",
    "userId": "66f0c1a2b3c4d5e6f7a8b9c0",
    "name": "Asha Singh",
    "role": "admin",
    "access": "write",
    "canLogin": true,
    "isOwner": true,
    "status": "active",
    "createdAt": "2026-09-27T10:16:00.000Z",
    "updatedAt": "2026-09-27T10:16:00.000Z",
    "user": { "email": "asha@example.com", "avatarUrl": null, "avatarColor": null }
  }
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `familyName` missing or too long, or an unknown field was sent |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>GET /family</code> — Get the selected family's details</summary>

**Who can call:** family member · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

`defaultShareDuration` (also under `settings`, same value) is how long a new share link lasts when the sharer doesn't pick one. `storageBytes` is the family's stored file size. `emailEnabled` says whether email (SMTP) is set up on the server.

**Response** `200 OK`

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c1",
  "name": "The Singh Family",
  "slug": "the-singh-family",
  "createdBy": "66f0c1a2b3c4d5e6f7a8b9c0",
  "settings": { "defaultShareDuration": "12h" },
  "storageBytes": 18350112,
  "createdAt": "2026-08-01T09:00:00.000Z",
  "updatedAt": "2026-09-20T08:30:00.000Z",
  "defaultShareDuration": "12h",
  "emailEnabled": true
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 404 | `NOT_FOUND` | the family no longer exists |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>PATCH /family</code> — Rename the family or change the default share-link length</summary>

**Who can call:** family admin · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, send at least one field; unknown fields — e.g. `maxFileMB` — are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `name` | string | no | trimmed, 1–150 characters |
| `defaultShareDuration` | string | no | `12h`, `24h` or `7d` |
| `settings.defaultShareDuration` | string | no | same as above (either place works; top level wins if both are sent) |

**Response** `200 OK` — the updated family (no `emailEnabled` here):

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c1",
  "name": "Singh Parivar",
  "slug": "the-singh-family",
  "createdBy": "66f0c1a2b3c4d5e6f7a8b9c0",
  "settings": { "defaultShareDuration": "24h" },
  "storageBytes": 18350112,
  "createdAt": "2026-08-01T09:00:00.000Z",
  "updatedAt": "2026-09-27T10:30:00.000Z",
  "defaultShareDuration": "24h"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | empty body, an invalid value, or an unknown field |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | not a family admin |
| 404 | `NOT_FOUND` | the family no longer exists |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /family/test-email</code> — Send yourself a test email</summary>

**Who can call:** family admin · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

Always sends to the caller's own email and waits for the real result (up to 10 seconds). `ok: true` means the mail server accepted it. `queued` is the same as `ok` (kept for older apps).

**Response** `200 OK` — delivered:

```json
{
  "ok": true,
  "queued": true,
  "emailEnabled": true,
  "to": "asha@example.com"
}
```

`200 OK` — not delivered (`error` is `EMAIL_DISABLED`, `EMAIL_TURNED_OFF` or `SEND_FAILED`; `code` is only there for `SEND_FAILED`):

```json
{
  "ok": false,
  "queued": false,
  "emailEnabled": true,
  "to": "asha@example.com",
  "error": "SEND_FAILED",
  "code": "EAUTH",
  "hint": "The mail server refused the username or password. …"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | not a family admin |
| 404 | `NOT_FOUND` | the account was deleted during the request (rare) |
| 429 | — (plain-text body) | over the general limit |

</details>

---

## Members

List the people in a family, invite new ones and manage their role, access and status.

**Base path:** `/members`

<details>
<summary><code>GET /members</code> — List everyone in the family</summary>

**Who can call:** family member · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

Owner first, then oldest first. `user` is only there for members who can sign in; for a pending invite it holds the invited email. `status` is `active`, `disabled` or `invited`. `notificationPrefs` also appears on an admin who has changed their alert settings.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c2",
      "familyId": "66f0c1a2b3c4d5e6f7a8b9c1",
      "userId": "66f0c1a2b3c4d5e6f7a8b9c0",
      "name": "Asha Singh",
      "role": "admin",
      "access": "write",
      "canLogin": true,
      "isOwner": true,
      "status": "active",
      "createdAt": "2026-08-01T09:00:00.000Z",
      "updatedAt": "2026-08-01T09:00:00.000Z",
      "user": {
        "email": "asha@example.com",
        "avatarUrl": null,
        "avatarColor": "#FF5A5F"
      }
    }
  ]
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /members</code> — Invite a person to the family</summary>

**Who can call:** family admin · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON, unknown fields are rejected). The app sends `{ name, email, role, access }`.

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `name` | string | yes | trimmed, 1–100 characters |
| `email` | string | yes, unless `canLogin` is `false` | trimmed, a valid email |
| `role` | string | no | `member` (default) or `admin`. An admin always gets `access: write` |
| `access` | string | no | `write` (default) or `read` |
| `sendInvite` | boolean | no | `false` = create the invite and return its link but send no email |
| `canLogin` | boolean | no | default `true`. Legacy: `false` makes a profile-only record (no email, no sign-in, `access: read`, can't be `admin`) |
| `tempPassword` | string | no | legacy, 8–128 characters: creates an **active** member with this password right away and no invite (unless `sendInvite: true` is also sent) |

The person is created with `status: invited`. If the email already has an account, they join the moment they next sign in; if not, no account is made until they sign up or accept. The invite link is valid 7 days and single-use. `emailSent` is `true` only when the mail server accepted the invite email; otherwise `emailError` says why (`EMAIL_DISABLED`, `EMAIL_TURNED_OFF` or `SEND_FAILED`). No `emailError` when `sendInvite: false`.

**Response** `201 Created`

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9d1",
  "familyId": "66f0c1a2b3c4d5e6f7a8b9c1",
  "userId": null,
  "name": "Ravi Singh",
  "role": "member",
  "access": "write",
  "canLogin": true,
  "isOwner": false,
  "status": "invited",
  "createdAt": "2026-09-27T10:40:00.000Z",
  "updatedAt": "2026-09-27T10:40:00.000Z",
  "user": { "email": "ravi@example.com", "avatarUrl": null, "avatarColor": null },
  "invite": {
    "url": "https://app.example.com/accept-invite?token=…",
    "expiresAt": "2026-10-04T10:40:00.000Z",
    "emailSent": true
  }
}
```

With `tempPassword` or `canLogin: false` there is no `invite` and `status` is `active`.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `name` missing, `email` missing/invalid, an admin without sign-in, or an unknown field |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | not a family admin |
| 409 | `ALREADY_MEMBER` | this email is already in the family or already invited (use `POST /members/:id/invite-link`) |
| 409 | `EMAIL_TAKEN` | `tempPassword` shape only: an account with this email already exists |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /members/:id/invite-link</code> — Get a fresh invite link for a pending invite</summary>

**Who can call:** family admin · **Rate limit:** 30 per 15 min per admin (shared with resend-invite); also the general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | the membership id of a member with `status: invited` |

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `resend` | string | no | `1` or `true` = same as `resend: true` in the body |

**Body** (JSON, optional; unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `resend` | boolean | no | `true` also emails the new link. Default: no email |

Makes a new link every time — the previous link stops working.

**Response** `200 OK`

```json
{
  "url": "https://app.example.com/accept-invite?token=…",
  "expiresAt": "2026-10-04T10:45:00.000Z",
  "emailSent": false
}
```

`emailError` (`EMAIL_DISABLED`, `EMAIL_TURNED_OFF` or `SEND_FAILED`) is added when `resend` was asked for but the email didn't go out.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `resend` is not true/false, or an unknown field was sent |
| 400 | `NOT_INVITED` | this member has no pending invite |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | not a family admin |
| 404 | `NOT_FOUND` | no such member in this family |
| 429 | `RATE_LIMITED` | more than 30 invite links by this admin in 15 minutes |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /members/:id/resend-invite</code> — Email a fresh invite link</summary>

**Who can call:** family admin · **Rate limit:** 30 per 15 min per admin (shared with invite-link); also the general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | the membership id of a member with `status: invited` |

**Query parameters:** none

**Body:** none

Makes a new link (the old one stops working) and emails it. Same as `POST /members/:id/invite-link` with `resend: true`, but the link is not returned.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `NOT_INVITED` | this member has no pending invite |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | not a family admin |
| 404 | `NOT_FOUND` | no such member in this family |
| 429 | `RATE_LIMITED` | more than 30 invite links by this admin in 15 minutes |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>PATCH /members/:id</code> — Change a member's name, role, access or status</summary>

**Who can call:** family admin · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | the membership id |

**Query parameters:** none

**Body** (JSON, send at least one field; unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `name` | string | no | trimmed, 1–100 characters |
| `access` | string | no | `read` or `write` (an admin always stays `write`) |
| `role` | string | no | `admin` or `member`. Making someone admin sets `access: write`. Works on pending invites too |
| `status` | string | no | `active` or `disabled`. Disabling signs that person out everywhere |

Changes apply on the member's very next request.

**Response** `200 OK`

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9d1",
  "familyId": "66f0c1a2b3c4d5e6f7a8b9c1",
  "userId": "66f0c1a2b3c4d5e6f7a8b9d0",
  "name": "Ravi Singh",
  "role": "admin",
  "access": "write",
  "canLogin": true,
  "isOwner": false,
  "status": "active",
  "createdAt": "2026-09-27T10:40:00.000Z",
  "updatedAt": "2026-09-27T11:00:00.000Z",
  "user": { "email": "ravi@example.com", "avatarUrl": null, "avatarColor": null }
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | empty body, an invalid value, or an unknown field |
| 400 | `CANNOT_REMOVE_OWNER` | trying to disable the family owner |
| 400 | `CANNOT_CHANGE_OWNER` | trying to change the owner's role |
| 400 | `NOT_LOGIN_ENABLED` | trying to make a profile-only member an admin |
| 400 | `LAST_ADMIN` | trying to demote the family's last active admin |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | not a family admin |
| 404 | `NOT_FOUND` | no such member in this family |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /members/:id/reset-password</code> — Set a new password for a member</summary>

**Who can call:** family admin · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | the membership id |

**Query parameters:** none

**Body** (JSON, unknown fields are rejected)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `newPassword` | string | yes | 8–128 characters |

Also signs that person out on every device.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `newPassword` missing or too short/long, or an unknown field was sent |
| 400 | `NOT_LOGIN_ENABLED` | the member has no sign-in (profile-only, or a pending invite with no account yet) |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | not a family admin |
| 404 | `NOT_FOUND` | no such member in this family |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>DELETE /members/:id</code> — Remove a member from the family</summary>

**Who can call:** family admin · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | the membership id |

**Query parameters:** none

**Body:** none

Removes only the person's access and signs them out everywhere. Everything they added (folders, documents, passwords, notes) stays with the family. Their account itself is kept.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `CANNOT_REMOVE_OWNER` | trying to remove the family owner |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | not a family admin |
| 404 | `NOT_FOUND` | no such member in this family |
| 429 | — (plain-text body) | over the general limit |

</details>

---

## Folders

Browse, create, rename, move and delete folders. Every family has one **Shared** folder that can't be renamed, moved or deleted, and no other folder may be called "Shared" or "साझा". Folders in the Bin are left out everywhere.

**Base path:** `/folders`

<details>
<summary><code>GET /folders/tree</code> — List every folder in the family</summary>

**Who can call:** family member · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

A flat list, Shared first, then A→Z. Counts are direct children only (Bin excluded). `parentId: null` = top level.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c3",
      "name": "Shared",
      "parentId": null,
      "isSystem": true,
      "documentCount": 4,
      "itemCount": 2,
      "folderCount": 1
    }
  ]
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>GET /folders/browse</code> — Open one folder level</summary>

**Who can call:** family member · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `folderId` | string | no | `root` (default) or a 24-character folder id |

At the top level `folder` is `null`, `breadcrumbs` is empty, and `documents`/`items` are always empty (only folders live there). `breadcrumbs` runs from the top down and ends with the current folder. `folder` itself comes back with zero counts. Items never include a password or secret field values.

**Response** `200 OK`

```json
{
  "folder": {
    "id": "66f0c1a2b3c4d5e6f7a8b9c6",
    "name": "Papa",
    "parentId": null,
    "isSystem": false,
    "documentCount": 0,
    "itemCount": 0,
    "folderCount": 0
  },
  "breadcrumbs": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9c6", "name": "Papa", "parentId": null, "isSystem": false }
  ],
  "folders": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c7",
      "name": "Medical",
      "parentId": "66f0c1a2b3c4d5e6f7a8b9c6",
      "isSystem": false,
      "documentCount": 3,
      "itemCount": 0,
      "folderCount": 0
    }
  ],
  "documents": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c4",
      "title": "Aadhaar card",
      "folderId": "66f0c1a2b3c4d5e6f7a8b9c6",
      "fileCount": 2,
      "primaryThumbUrl": "/api/files/eyJ…",
      "createdAt": "2026-09-01T12:00:00.000Z",
      "updatedAt": "2026-09-01T12:00:00.000Z"
    }
  ],
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c8",
      "kind": "login",
      "title": "Bank netbanking",
      "folderId": "66f0c1a2b3c4d5e6f7a8b9c6",
      "username": "papa.singh",
      "hasPassword": true,
      "fields": [{ "key": "ATM PIN", "value": "", "secret": true }],
      "notes": "",
      "createdAt": "2026-09-02T08:00:00.000Z",
      "updatedAt": "2026-09-02T08:00:00.000Z"
    }
  ]
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `folderId` is not `root` or a valid id |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 404 | `FOLDER_NOT_FOUND` | no such folder in this family, or it is in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /folders</code> — Create a folder</summary>

**Who can call:** write access · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body** (JSON; unknown fields are ignored)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `name` | string | yes | trimmed, 1–120 characters; not "Shared" or "साझा" (any case) |
| `parentId` | string | no | `root` (default = top level) or a folder id |

**Response** `201 Created` (a new folder always has zero counts)

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c6",
  "name": "Papa",
  "parentId": null,
  "isSystem": false,
  "documentCount": 0,
  "itemCount": 0,
  "folderCount": 0
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `name` missing or too long, or `parentId` is not `root` or a valid id |
| 400 | `RESERVED_FOLDER_NAME` | the name is "Shared" or "साझा" |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | read-only member (write access needed) |
| 404 | `FOLDER_NOT_FOUND` | the parent folder doesn't exist in this family or is in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>PATCH /folders/:id</code> — Rename or move a folder</summary>

**Who can call:** write access · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character folder id |

**Query parameters:** none

**Body** (JSON; unknown fields are ignored)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `name` | string | no | trimmed, 1–120 characters; not "Shared"/"साझा" (re-sending a folder's unchanged name is allowed) |
| `parentId` | string | no | `root` = move to the top level, or the id of the new parent folder |

**Response** `200 OK` (counts come back as zero here — use `/folders/tree` or `/folders/browse` for live counts)

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c6",
  "name": "Papa ji",
  "parentId": null,
  "isSystem": false,
  "documentCount": 0,
  "itemCount": 0,
  "folderCount": 0
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad id, `name` empty or too long, or `parentId` is not `root` or a valid id |
| 400 | `SYSTEM_FOLDER` | this is the Shared folder |
| 400 | `RESERVED_FOLDER_NAME` | renaming to "Shared" or "साझा" |
| 400 | `CANNOT_MOVE_INTO_DESCENDANT` | moving a folder into itself or one of its own subfolders |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | read-only member (write access needed) |
| 404 | `FOLDER_NOT_FOUND` | the folder or the target parent doesn't exist in this family, or is in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>DELETE /folders/:id</code> — Move a folder and everything inside it to the Bin</summary>

**Who can call:** write access · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character folder id |

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `confirm` | string | no | only `1` actually deletes. Anything else (or left out) just returns what would be removed |

Moves the folder, all its subfolders and every document and item inside them to the Bin (they can be restored from `/bin`). Stored files are not deleted. Counts: `folderCount` = subfolders (not counting this one), `fileCount` = files in those documents.

**Response** `200 OK` — preview (no `confirm=1`):

```json
{
  "requiresConfirm": true,
  "folderCount": 2,
  "documentCount": 5,
  "itemCount": 1,
  "fileCount": 9
}
```

`200 OK` — done (`confirm=1`): the same counts with `"requiresConfirm": false`.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad id |
| 400 | `SYSTEM_FOLDER` | this is the Shared folder |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | read-only member (write access needed) |
| 404 | `FOLDER_NOT_FOUND` | no such folder in this family, or it is already in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /folders/:id/zip-link</code> — Get a link to download a folder as a ZIP</summary>

**Who can call:** family member · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character folder id |

**Query parameters:** none

**Body:** none

The link covers every file in this folder and all its subfolders, and works for 5 minutes. The `url` starts with `/api`, so put it after the API's host (not after the base URL). Open it with `GET /files/zip/:token`.

**Response** `200 OK`

```json
{
  "url": "/api/files/zip/eyJ…"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad id |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 404 | `FOLDER_NOT_FOUND` | no such folder in this family, or it is in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

---

## Documents

A document is a title, one or more files (photos or PDFs) and notes. Notes and the text read from each file are stored encrypted and come back as plain text to members. Documents in the Bin are left out everywhere.

**Base path:** `/documents`

<details>
<summary><code>GET /documents</code> — List documents, newest first</summary>

**Who can call:** family member · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `folderId` | string | no | a 24-character folder id: only documents directly in that folder. Left out = the whole family |
| `page` | integer | no | 1 or more, default `1` |
| `limit` | integer | no | 1–100, default `20` |

Sorted by last change, newest first. Notes are not included — open the document for them.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c4",
      "title": "Aadhaar card",
      "folderId": "66f0c1a2b3c4d5e6f7a8b9c6",
      "fileCount": 2,
      "primaryThumbUrl": "/api/files/eyJ…",
      "createdAt": "2026-09-01T12:00:00.000Z",
      "updatedAt": "2026-09-01T12:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1,
  "totalPages": 1
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad `folderId`, or `page`/`limit` out of range |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>GET /documents/:id</code> — Get one document with its files</summary>

**Who can call:** family member · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character document id |

**Query parameters:** none

**Body:** none

`url`, `thumbUrl` and `downloadUrl` are signed links that need no header and work for 1 hour (`thumbUrl` is `null` for PDFs). `text` is the text read from each file (`""` for none) and is only returned here. `createdByName`/`updatedByName` are member names (or `null`) and only come with this GET. Opening a document is logged at most once per member every 10 minutes.

**Response** `200 OK`

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c4",
  "title": "Aadhaar card",
  "folderId": "66f0c1a2b3c4d5e6f7a8b9c6",
  "notes": "Front and back",
  "files": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c5",
      "label": "Front",
      "order": 0,
      "originalName": "aadhaar-front.jpg",
      "mimeType": "image/jpeg",
      "size": 482113,
      "width": 1600,
      "height": 1000,
      "url": "/api/files/eyJ…",
      "thumbUrl": "/api/files/eyJ…",
      "downloadUrl": "/api/files/eyJ…",
      "uploadedAt": "2026-09-01T12:00:00.000Z",
      "text": "Government of India …"
    }
  ],
  "breadcrumbs": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9c6", "name": "Papa", "parentId": null, "isSystem": false }
  ],
  "createdBy": "66f0c1a2b3c4d5e6f7a8b9c2",
  "createdAt": "2026-09-01T12:00:00.000Z",
  "updatedAt": "2026-09-01T12:00:00.000Z",
  "createdByName": "Asha Singh",
  "updatedByName": null
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad id |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 404 | `DOCUMENT_NOT_FOUND` | no such document in this family, or it is in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /documents</code> — Upload a new document</summary>

**Who can call:** write access · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: multipart/form-data` (let the browser or `curl -F` set the boundary)

**Path parameters:** none

**Query parameters:** none

**Body** (`multipart/form-data`)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `data` | text (JSON string) | yes | `{ "title", "folderId"?, "notes"? }` — see the next table |
| `files` | file, repeat the field for more | yes | 1–20 files. Allowed: JPEG, PNG, WebP, HEIC/HEIF (turned into JPEG) and PDF. The type is checked from the file's content, not its name; SVG and anything else is refused. Each file up to the platform's `maxFileMB` (starts at `MAX_FILE_MB`, 20 MB) |
| `labels` | text (JSON array of strings) | no | one per file, same order as `files`; the name shown for each file. Default `""` |
| `texts` | text (JSON array) | no | one per file, same order; the text read from each file (string, or `null`/`""` for none). Trimmed and cut to 20 000 characters; stored encrypted |

Fields inside `data` (unknown keys are ignored):

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `title` | string | yes | trimmed, 1–200 characters |
| `folderId` | string or null | no | a folder id; left out, `null` or `"root"` = the Shared folder |
| `notes` | string | no | up to 5000 characters, default `""`; stored encrypted |

Images get a small WebP thumbnail; PDFs don't (`thumbUrl: null`).

**Response** `201 Created` — the full document (as in `GET /documents/:id`, without `createdByName`/`updatedByName`):

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c4",
  "title": "Aadhaar card",
  "folderId": "66f0c1a2b3c4d5e6f7a8b9c6",
  "notes": "",
  "files": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c5",
      "label": "aadhaar-front",
      "order": 0,
      "originalName": "aadhaar-front.jpg",
      "mimeType": "image/jpeg",
      "size": 482113,
      "width": 1600,
      "height": 1000,
      "url": "/api/files/eyJ…",
      "thumbUrl": "/api/files/eyJ…",
      "downloadUrl": "/api/files/eyJ…",
      "uploadedAt": "2026-09-27T11:10:00.000Z",
      "text": ""
    }
  ],
  "breadcrumbs": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9c6", "name": "Papa", "parentId": null, "isSystem": false }
  ],
  "createdBy": "66f0c1a2b3c4d5e6f7a8b9c2",
  "createdAt": "2026-09-27T11:10:00.000Z",
  "updatedAt": "2026-09-27T11:10:00.000Z"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `data` is not valid JSON or has a bad title/folder/notes; no file; more than 20 files or a file in a field other than `files`; `labels`/`texts` not a JSON array of the right length |
| 400 | `UNSUPPORTED_FILE_TYPE` | a file is not JPEG, PNG, WebP, HEIC/HEIF or PDF, or a HEIC photo can't be read |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | read-only member (write access needed) |
| 404 | `FOLDER_NOT_FOUND` | `folderId` doesn't exist in this family or is in the Bin |
| 413 | `FILE_TOO_LARGE` | a file is bigger than the size limit |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>PATCH /documents/:id</code> — Change a document's title or notes, or move it</summary>

**Who can call:** write access · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character document id |

**Query parameters:** none

**Body** (JSON, all optional; unknown fields are ignored)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `title` | string | no | trimmed, 1–200 characters |
| `notes` | string | no | up to 5000 characters; stored encrypted |
| `folderId` | string or null | no | a folder id to move it there; `null` or `"root"` = the Shared folder |

**Response** `200 OK` — the full document (same shape as the `POST /documents` response).

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c4",
  "title": "Aadhaar card (Papa)",
  "folderId": "66f0c1a2b3c4d5e6f7a8b9c6",
  "notes": "Front and back",
  "files": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c5",
      "label": "Front",
      "order": 0,
      "originalName": "aadhaar-front.jpg",
      "mimeType": "image/jpeg",
      "size": 482113,
      "width": 1600,
      "height": 1000,
      "url": "/api/files/eyJ…",
      "thumbUrl": "/api/files/eyJ…",
      "downloadUrl": "/api/files/eyJ…",
      "uploadedAt": "2026-09-01T12:00:00.000Z",
      "text": ""
    }
  ],
  "breadcrumbs": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9c6", "name": "Papa", "parentId": null, "isSystem": false }
  ],
  "createdBy": "66f0c1a2b3c4d5e6f7a8b9c2",
  "createdAt": "2026-09-01T12:00:00.000Z",
  "updatedAt": "2026-09-27T11:20:00.000Z"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad id, empty or too-long title, too-long notes, or a bad `folderId` |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | read-only member (write access needed) |
| 404 | `DOCUMENT_NOT_FOUND` | no such document in this family, or it is in the Bin |
| 404 | `FOLDER_NOT_FOUND` | the target folder doesn't exist in this family or is in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>DELETE /documents/:id</code> — Move a document to the Bin</summary>

**Who can call:** write access · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character document id |

**Query parameters:** none

**Body:** none

The document and its files go to the Bin and can be restored from `/bin`. Stored files are not deleted (they still count toward storage until a platform admin purges them).

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad id |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | read-only member (write access needed) |
| 404 | `DOCUMENT_NOT_FOUND` | no such document in this family, or it is already in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /documents/:id/files</code> — Add more files to a document</summary>

**Who can call:** write access · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: multipart/form-data`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character document id |

**Query parameters:** none

**Body** (`multipart/form-data`)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `files` | file, repeat the field for more | yes | 1–20 files; same types and size limit as `POST /documents` |
| `labels` | text (JSON array of strings) | no | one per file, same order as `files` |
| `texts` | text (JSON array) | no | one per file, same order; string or `null`; trimmed, cut to 20 000 characters |

New files are added after the existing ones.

**Response** `200 OK` — the updated document (same shape as the `POST /documents` response, now with the extra files in `files`).

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c4",
  "title": "Aadhaar card",
  "folderId": "66f0c1a2b3c4d5e6f7a8b9c6",
  "notes": "Front and back",
  "files": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c9",
      "label": "Back",
      "order": 1,
      "originalName": "aadhaar-back.pdf",
      "mimeType": "application/pdf",
      "size": 210334,
      "width": null,
      "height": null,
      "url": "/api/files/eyJ…",
      "thumbUrl": null,
      "downloadUrl": "/api/files/eyJ…",
      "uploadedAt": "2026-09-27T11:30:00.000Z",
      "text": ""
    }
  ],
  "breadcrumbs": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9c6", "name": "Papa", "parentId": null, "isSystem": false }
  ],
  "createdBy": "66f0c1a2b3c4d5e6f7a8b9c2",
  "createdAt": "2026-09-01T12:00:00.000Z",
  "updatedAt": "2026-09-27T11:30:00.000Z"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad id; no file; more than 20 files or a file in a field other than `files`; `labels`/`texts` not a JSON array of the right length |
| 400 | `UNSUPPORTED_FILE_TYPE` | a file is not JPEG, PNG, WebP, HEIC/HEIF or PDF, or a HEIC photo can't be read |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | read-only member (write access needed) |
| 404 | `DOCUMENT_NOT_FOUND` | no such document in this family, or it is in the Bin |
| 413 | `FILE_TOO_LARGE` | a file is bigger than the size limit |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>DELETE /documents/:id/files/:fileId</code> — Move one file to the Bin</summary>

**Who can call:** write access · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character document id |
| `fileId` | string | 24-character file id |

**Query parameters:** none

**Body:** none

The file can be restored from `/bin`. From now on it is left out everywhere and its signed links stop working. A document always keeps at least one file — delete the document instead.

**Response** `200 OK` — the updated document (same shape as the `POST /documents` response, without the removed file).

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c4",
  "title": "Aadhaar card",
  "folderId": "66f0c1a2b3c4d5e6f7a8b9c6",
  "notes": "Front and back",
  "files": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c5",
      "label": "Front",
      "order": 0,
      "originalName": "aadhaar-front.jpg",
      "mimeType": "image/jpeg",
      "size": 482113,
      "width": 1600,
      "height": 1000,
      "url": "/api/files/eyJ…",
      "thumbUrl": "/api/files/eyJ…",
      "downloadUrl": "/api/files/eyJ…",
      "uploadedAt": "2026-09-01T12:00:00.000Z",
      "text": ""
    }
  ],
  "breadcrumbs": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9c6", "name": "Papa", "parentId": null, "isSystem": false }
  ],
  "createdBy": "66f0c1a2b3c4d5e6f7a8b9c2",
  "createdAt": "2026-09-01T12:00:00.000Z",
  "updatedAt": "2026-09-27T11:40:00.000Z"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad `id` or `fileId` |
| 400 | `LAST_FILE` | this is the document's only file left |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | read-only member (write access needed) |
| 404 | `DOCUMENT_NOT_FOUND` | no such document in this family, or it is in the Bin |
| 404 | `FILE_NOT_FOUND` | no such file on this document, or it is already in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>PATCH /documents/:id/files/:fileId/text</code> — Save the text read from one file</summary>

**Who can call:** write access · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character document id |
| `fileId` | string | 24-character file id |

**Query parameters:** none

**Body** (JSON)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `text` | string or null | yes (may be `null`) | up to 40 000 characters accepted; saved trimmed and cut to 20 000. `null` or `""` clears it. Stored encrypted |

**Response** `200 OK` — the updated document (same shape as the `POST /documents` response; the file's `text` shows the saved value).

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c4",
  "title": "Aadhaar card",
  "folderId": "66f0c1a2b3c4d5e6f7a8b9c6",
  "notes": "Front and back",
  "files": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c5",
      "label": "Front",
      "order": 0,
      "originalName": "aadhaar-front.jpg",
      "mimeType": "image/jpeg",
      "size": 482113,
      "width": 1600,
      "height": 1000,
      "url": "/api/files/eyJ…",
      "thumbUrl": "/api/files/eyJ…",
      "downloadUrl": "/api/files/eyJ…",
      "uploadedAt": "2026-09-01T12:00:00.000Z",
      "text": "Government of India …"
    }
  ],
  "breadcrumbs": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9c6", "name": "Papa", "parentId": null, "isSystem": false }
  ],
  "createdBy": "66f0c1a2b3c4d5e6f7a8b9c2",
  "createdAt": "2026-09-01T12:00:00.000Z",
  "updatedAt": "2026-09-27T11:50:00.000Z"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad `id` or `fileId`, `text` missing, not a string/null, or longer than 40 000 characters |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 403 | `FORBIDDEN` | read-only member (write access needed) |
| 404 | `DOCUMENT_NOT_FOUND` | no such document in this family, or it is in the Bin |
| 404 | `FILE_NOT_FOUND` | no such file on this document, or it is in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>POST /documents/:id/zip-link</code> — Get a link to download a document's files as a ZIP</summary>

**Who can call:** family member · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character document id |

**Query parameters:** none

**Body** (JSON, optional; unknown fields are ignored)

| Field | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `fileIds` | array of strings | no | file ids of this document to include; left out or empty = all files |

The link works for 5 minutes. The `url` starts with `/api`, so put it after the API's host. Open it with `GET /files/zip/:token`.

**Response** `200 OK`

```json
{
  "url": "/api/files/zip/eyJ…"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad id, a malformed file id, or a file id that isn't an active file of this document |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 404 | `DOCUMENT_NOT_FOUND` | no such document in this family, or it is in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>GET /documents/:id/activity</code> — List what happened to one document</summary>

**Who can call:** family member · **Rate limit:** general limit (300 per min per IP)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `id` | string | 24-character document id |

**Query parameters:** none

**Body:** none

Views, edits, file changes, downloads and share links for this document, newest first, at most 200 entries (no paging).

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9e0",
      "actorName": "Asha Singh",
      "action": "document.view",
      "targetType": "document",
      "targetId": "66f0c1a2b3c4d5e6f7a8b9c4",
      "documentId": "66f0c1a2b3c4d5e6f7a8b9c4",
      "folderId": "66f0c1a2b3c4d5e6f7a8b9c6",
      "shareId": null,
      "meta": {},
      "createdAt": "2026-09-27T11:05:00.000Z"
    }
  ]
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | bad id |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `SESSION_REVOKED` | no token, a bad or expired token, or signed out everywhere |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | not an active member of that family |
| 404 | `DOCUMENT_NOT_FOUND` | no such document in this family, or it is in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

---

## Files

Download file bytes. These links carry their own signed token in the path, so they need no `Authorization` or `X-Family-Id` header and can go straight into `<img src>`, an `<iframe>` or a download link.

**Base path:** `/files`

<details>
<summary><code>GET /files/:signedToken</code> — Open or download one file or thumbnail</summary>

**Who can call:** public (the signed token in the link is the credential) · **Rate limit:** general limit (300 per min per IP)

**Headers:** none needed. Optional `Range: bytes=start-end` to fetch part of the file

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `signedToken` | string | the token inside a `url`, `thumbUrl` or `downloadUrl` from a document response (valid 1 hour) |

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `download` | string | no | `1` = make the browser save the file (and log a download). Anything else = show it inline |

**Body:** none

**Response** `200 OK` — the decrypted file bytes (not JSON).

- `Content-Type`: the file's type (`image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` or `application/pdf`; thumbnails are `image/webp`; anything else is sent as `application/octet-stream`)
- `Content-Disposition`: `inline; filename="<name>"`, or `attachment; filename="<name>"` with `?download=1`
- `Content-Length`, `Accept-Ranges: bytes`, `X-Content-Type-Options: nosniff`
- The page can be shown in an `<iframe>` on the app's own site (`CLIENT_URL`)

`206 Partial Content` — when a valid `Range` header is sent: only those bytes, plus `Content-Range: bytes start-end/total`.

`416 Range Not Satisfiable` — the range starts after it ends; empty body with `Content-Range: bytes */total`.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 401 | `INVALID_OR_EXPIRED_FILE_TOKEN` | the token is bad or older than 1 hour, or the document or file is gone or in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

<details>
<summary><code>GET /files/zip/:token</code> — Download a folder or document as a ZIP</summary>

**Who can call:** public (the signed token in the link is the credential) · **Rate limit:** general limit (300 per min per IP)

**Headers:** none needed

**Path parameters**

| Name | Type | Rules / notes |
| --- | --- | --- |
| `token` | string | the token inside the `url` from `POST /folders/:id/zip-link` or `POST /documents/:id/zip-link` (valid 5 minutes) |

**Query parameters:** none

**Body:** none

**Response** `200 OK` — a ZIP file streamed as it is built (not JSON).

- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="<folder name or document title>.zip"`
- `X-Content-Type-Options: nosniff`
- A folder ZIP holds every file in the folder and its subfolders, grouped into one sub-folder per document title. A document ZIP holds that document's files (only the chosen `fileIds`, if any), at the top level. Files and documents in the Bin are left out. Duplicate names get ` (2)`, ` (3)`, … added.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 401 | `INVALID_OR_EXPIRED_FILE_TOKEN` | the token is bad or older than 5 minutes, or the folder/document is gone or in the Bin |
| 429 | — (plain-text body) | over the general limit |

</details>

---

## Passwords and notes

An item is a saved password (`kind: login`) or a note (`kind: note`); every value is stored encrypted and comes back as plain text to family members.

**Base path:** `/items`

<details>
<summary><code>GET /items</code> — List passwords and notes</summary>

**Who can call:** family member · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `folderId` | id | no | 24-character id. Only items directly in this folder (not its subfolders). `root` is not accepted here. |
| `kind` | enum | no | `login` or `note` |
| `page` | number | no | Whole number, 1 or more. Default `1`. |
| `limit` | number | no | Whole number, 1 to 100. Default `20`. |

Newest change first. Items in the Bin are left out. The list never includes the password, and a secret extra field comes back with an empty `value`.

**Body:** none

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c0",
      "kind": "login",
      "title": "SBI net banking",
      "folderId": "66f0c1a2b3c4d5e6f7a8b9c1",
      "username": "asha.sharma",
      "hasPassword": true,
      "fields": [
        { "key": "ATM PIN", "value": "", "secret": true },
        { "key": "Customer ID", "value": "12345678", "secret": false }
      ],
      "notes": "Branch: MG Road",
      "createdAt": "2026-09-20T10:15:00.000Z",
      "updatedAt": "2026-09-25T08:30:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1,
  "totalPages": 1
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a query parameter is invalid |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>GET /items/:id</code> — Get one password or note in full</summary>

**Who can call:** family member · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | 24-character item id |

**Query parameters:** none

**Body:** none

Returns the plain-text password and every extra field value, including secret ones. Logs an `item.view` activity entry (at most once per 10 minutes per member and item).

**Response** `200 OK`

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c0",
  "kind": "login",
  "title": "SBI net banking",
  "folderId": "66f0c1a2b3c4d5e6f7a8b9c1",
  "username": "asha.sharma",
  "hasPassword": true,
  "fields": [
    { "key": "ATM PIN", "value": "4321", "secret": true },
    { "key": "Customer ID", "value": "12345678", "secret": false }
  ],
  "notes": "Branch: MG Road",
  "createdAt": "2026-09-20T10:15:00.000Z",
  "updatedAt": "2026-09-25T08:30:00.000Z",
  "password": "example-password",
  "breadcrumbs": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9c2", "name": "Shared", "parentId": null, "isSystem": true },
    { "id": "66f0c1a2b3c4d5e6f7a8b9c1", "name": "Bank", "parentId": "66f0c1a2b3c4d5e6f7a8b9c2", "isSystem": false }
  ],
  "createdByName": "Asha",
  "updatedByName": "Ravi"
}
```

`breadcrumbs` runs from the top folder down to the item's own folder. `createdByName` / `updatedByName` are `null` when unknown. For a note, `username` and `password` are `""` and `fields` is `[]`.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` is not a 24-character id |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 404 | `ITEM_NOT_FOUND` | no such item in this family, or it is in the Bin |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>POST /items</code> — Create a password or note</summary>

**Who can call:** write access · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `kind` | enum | yes | `login` (a saved password) or `note` |
| `title` | string | yes | Trimmed, 1 to 200 characters |
| `folderId` | id, `"root"` or `null` | no | Folder to save into. Left out, `null` or `"root"` = the family's Shared folder. |
| `username` | string | no | Up to 500 characters. Default `""`. Ignored for a note. |
| `password` | string | no | Up to 1000 characters. Default `""`. Ignored for a note. |
| `fields` | array | no | Up to 50 extra fields. Default `[]`. Ignored for a note. |
| `fields[].key` | string | yes | Trimmed, 1 to 120 characters |
| `fields[].value` | string or number | no | Default `""`. Stored as text. |
| `fields[].secret` | boolean | no | "Keep secret". Left out = `true` when the key looks sensitive ("ATM PIN", "UPI password", "OTP", "CVV", "पिन"…), else `false`. |
| `notes` | string | no | Up to 20000 characters. Default `""`. |

```json
{
  "kind": "login",
  "title": "SBI net banking",
  "folderId": "66f0c1a2b3c4d5e6f7a8b9c1",
  "username": "asha.sharma",
  "password": "example-password",
  "fields": [{ "key": "ATM PIN", "value": "4321" }],
  "notes": "Branch: MG Road"
}
```

**Response** `201 Created`

The full item, same shape as `GET /items/:id` but without `createdByName` / `updatedByName`.

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c0",
  "kind": "login",
  "title": "SBI net banking",
  "folderId": "66f0c1a2b3c4d5e6f7a8b9c1",
  "username": "asha.sharma",
  "hasPassword": true,
  "fields": [{ "key": "ATM PIN", "value": "4321", "secret": true }],
  "notes": "Branch: MG Road",
  "createdAt": "2026-09-27T09:00:00.000Z",
  "updatedAt": "2026-09-27T09:00:00.000Z",
  "password": "example-password",
  "breadcrumbs": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9c2", "name": "Shared", "parentId": null, "isSystem": true },
    { "id": "66f0c1a2b3c4d5e6f7a8b9c1", "name": "Bank", "parentId": "66f0c1a2b3c4d5e6f7a8b9c2", "isSystem": false }
  ]
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a body field is missing or invalid |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 403 | `FORBIDDEN` | you have read-only access |
| 404 | `FOLDER_NOT_FOUND` | `folderId` is not a folder of this family (or it is in the Bin) |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>PATCH /items/:id</code> — Change a password or note</summary>

**Who can call:** write access · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | 24-character item id |

**Query parameters:** none

**Body**

Send only what changes. Same rules as `POST /items`, but nothing is required and there are no defaults.

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `kind` | enum | no | `login` or `note`. Turning an item into a note clears its username, password and extra fields. |
| `title` | string | no | Trimmed, 1 to 200 characters |
| `folderId` | id, `"root"` or `null` | no | Moves the item. `null` or `"root"` = the Shared folder. |
| `username` | string | no | Up to 500 characters. Only used for a login. |
| `password` | string | no | Up to 1000 characters. Only used for a login. |
| `fields` | array | no | Up to 50 `{ key, value?, secret? }` (rules as on create). Replaces the whole list. Only used for a login. |
| `notes` | string | no | Up to 20000 characters |

Logs `item.update` with the names of the changed fields only, never their values.

**Response** `200 OK`

The full item, same shape as the `POST /items` response (includes `password` and `breadcrumbs`, no author names).

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c0",
  "kind": "login",
  "title": "SBI net banking",
  "folderId": "66f0c1a2b3c4d5e6f7a8b9c1",
  "username": "asha.sharma",
  "hasPassword": true,
  "fields": [{ "key": "ATM PIN", "value": "9876", "secret": true }],
  "notes": "Branch: MG Road",
  "createdAt": "2026-09-20T10:15:00.000Z",
  "updatedAt": "2026-09-27T09:05:00.000Z",
  "password": "new-example-password",
  "breadcrumbs": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9c2", "name": "Shared", "parentId": null, "isSystem": true },
    { "id": "66f0c1a2b3c4d5e6f7a8b9c1", "name": "Bank", "parentId": "66f0c1a2b3c4d5e6f7a8b9c2", "isSystem": false }
  ]
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` or a body field is invalid |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 403 | `FORBIDDEN` | you have read-only access |
| 404 | `ITEM_NOT_FOUND` | no such item in this family, or it is in the Bin |
| 404 | `FOLDER_NOT_FOUND` | `folderId` is not a folder of this family (or it is in the Bin) |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>DELETE /items/:id</code> — Move a password or note to the Bin</summary>

**Who can call:** write access · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | 24-character item id |

**Query parameters:** none

**Body:** none

Nothing is removed for good: the item goes to the family's Bin and can be restored with `POST /bin/item/:id/restore`. Logs `item.delete`.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` is not a 24-character id |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 403 | `FORBIDDEN` | you have read-only access |
| 404 | `ITEM_NOT_FOUND` | no such item in this family, or it is already in the Bin |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>GET /items/:id/activity</code> — List the activity for one item</summary>

**Who can call:** family member · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | 24-character item id |

**Query parameters:** none

**Body:** none

The last 200 entries for this item (views, creation, changes, delete, restore), newest first. No paging.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9d0",
      "actorName": "Asha",
      "action": "item.update",
      "targetType": "item",
      "targetId": "66f0c1a2b3c4d5e6f7a8b9c0",
      "meta": { "title": "SBI net banking", "fields": ["password"] },
      "createdAt": "2026-09-27T09:05:00.000Z"
    }
  ]
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` is not a 24-character id |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 404 | `ITEM_NOT_FOUND` | no such item in this family, or it is in the Bin |
| 429 | — | too many requests (plain-text body) |

</details>

---

## Search

Search one family's folders, documents and passwords/notes in one call.

**Base path:** `/search`

<details>
<summary><code>GET /search</code> — Search folders, documents and items</summary>

**Who can call:** family member · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `q` | string | yes | Trimmed, 1 to 200 characters. Case-insensitive, matches part of a word. |
| `folderId` | id, `root` or empty | no | Search only this folder and all its subfolders. Left out, empty or `root` = the whole family. The folder itself is not returned as a result. |
| `limit` | number | no | Whole number, 1 to 50. Default `20`. Applies to each of the three lists separately. |

What is searched: folder names (the Shared folder also matches "साझा"); document titles, notes and the text read from each file (not files in the Bin); item titles, usernames, notes, extra-field names and the values of non-secret extra fields. A saved password and the value of a secret field are never searched or shown. Anything in the Bin is left out. Title matches come first, then the most recently changed.

**Body:** none

**Response** `200 OK`

```json
{
  "folders": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c1",
      "name": "Bank",
      "parentId": "66f0c1a2b3c4d5e6f7a8b9c2",
      "isSystem": false,
      "path": "Shared"
    }
  ],
  "documents": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c3",
      "title": "PAN card",
      "folderId": "66f0c1a2b3c4d5e6f7a8b9c1",
      "path": "Shared › Bank",
      "fileCount": 2,
      "thumbnailUrl": "/api/files/<signed-token>",
      "updatedAt": "2026-09-25T08:30:00.000Z",
      "snippet": "Front: …Permanent Account Number ABCDE1234F…"
    }
  ],
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c0",
      "kind": "login",
      "title": "SBI net banking",
      "folderId": "66f0c1a2b3c4d5e6f7a8b9c1",
      "path": "Shared › Bank",
      "updatedAt": "2026-09-25T08:30:00.000Z",
      "snippet": null
    }
  ]
}
```

`path` is where the result lives (a folder's own name is not included; a top-level folder has `""`). `snippet` is `null` for a title match; a match in a file's text starts with that file's name. `thumbnailUrl` is a signed link valid for one hour, or `null`.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `q` is missing or too long, `folderId` is malformed, or `limit` is out of range |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 404 | `FOLDER_NOT_FOUND` | `folderId` is not a folder of this family (or it is in the Bin) |
| 429 | — | too many requests (plain-text body) |

</details>

---

## Share links

A share link lets someone without an account view and download a document or folder until it expires; every route here needs write access.

**Base path:** `/shares`

<details>
<summary><code>GET /shares</code> — List the family's share links</summary>

**Who can call:** write access · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `targetId` | id | no | 24-character id. Only links for this document or folder. |
| `status` | enum | no | `active`, `expired` or `revoked`. Left out = all. |

Newest first, no paging. Links whose document or folder is in the Bin are still listed, with `targetInBin: true` (the link shows "not found" until it is restored).

**Body:** none

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9e0",
      "targetType": "document",
      "targetId": "66f0c1a2b3c4d5e6f7a8b9c3",
      "targetLabel": "PAN card",
      "targetInBin": false,
      "fileIds": [],
      "duration": "24h",
      "expiresAt": "2026-09-28T09:00:00.000Z",
      "status": "active",
      "revokedAt": null,
      "openCount": 3,
      "downloadCount": 1,
      "lastOpenedAt": "2026-09-27T11:20:00.000Z",
      "createdBy": "66f0c1a2b3c4d5e6f7a8b9f0",
      "createdAt": "2026-09-27T09:00:00.000Z"
    }
  ]
}
```

`fileIds` is empty when the whole document (or folder) is shared. `createdBy` is the creator's membership id. The link itself (`url`) is never listed.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `targetId` or `status` is invalid |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 403 | `FORBIDDEN` | you have read-only access |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>POST /shares</code> — Create a share link</summary>

**Who can call:** write access · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `targetType` | enum | yes | `document` or `folder`. A folder link covers everything inside it, at any depth. |
| `targetId` | id | yes | 24-character id of the document or folder |
| `fileIds` | array of ids | no | Up to 200. Documents only: share just these files (for example one photo). Ids that are not active files of the document are dropped. Ignored for a folder. |
| `duration` | enum | no | `12h`, `24h` or `7d`. Left out = the family's default share duration (Settings → Family; `12h` if never set). |

```json
{
  "targetType": "document",
  "targetId": "66f0c1a2b3c4d5e6f7a8b9c3",
  "fileIds": ["66f0c1a2b3c4d5e6f7a8b9c4"],
  "duration": "24h"
}
```

**Response** `201 Created`

The share, plus `url`. The link is returned **only here** — the server keeps just a hash of it.

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9e0",
  "targetType": "document",
  "targetId": "66f0c1a2b3c4d5e6f7a8b9c3",
  "targetLabel": "PAN card",
  "targetInBin": false,
  "fileIds": ["66f0c1a2b3c4d5e6f7a8b9c4"],
  "duration": "24h",
  "expiresAt": "2026-09-28T09:00:00.000Z",
  "status": "active",
  "revokedAt": null,
  "openCount": 0,
  "downloadCount": 0,
  "lastOpenedAt": null,
  "createdBy": "66f0c1a2b3c4d5e6f7a8b9f0",
  "createdAt": "2026-09-27T09:00:00.000Z",
  "url": "https://app.example.com/s/<token>"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a body field is missing or invalid |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 403 | `FORBIDDEN` | you have read-only access |
| 404 | `NOT_FOUND` | the document or folder doesn't exist in this family (or is in the Bin), or none of `fileIds` is an active file of the document |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>PATCH /shares/:id</code> — Revoke or extend a share link</summary>

**Who can call:** write access · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`, `Content-Type: application/json`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | The share's id. Not checked up front (see errors). |

**Query parameters:** none

**Body**

At least one of the two fields is required.

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `revoke` | `true` | no | Only `true` is accepted. Turns the link off now. Revoking an already revoked link changes nothing. |
| `extendTo` | enum | no | `12h`, `24h` or `7d`. Restarts the clock: the link now expires this long from now. Does not undo a revoke. |

```json
{ "extendTo": "7d" }
```

**Response** `200 OK`

The updated share (no `url`). `targetInBin` is always `false` here, and `targetLabel` is `null` when the target is in the Bin.

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9e0",
  "targetType": "document",
  "targetId": "66f0c1a2b3c4d5e6f7a8b9c3",
  "targetLabel": "PAN card",
  "targetInBin": false,
  "fileIds": [],
  "duration": "7d",
  "expiresAt": "2026-10-04T09:10:00.000Z",
  "status": "active",
  "revokedAt": null,
  "openCount": 3,
  "downloadCount": 1,
  "lastOpenedAt": "2026-09-27T11:20:00.000Z",
  "createdBy": "66f0c1a2b3c4d5e6f7a8b9f0",
  "createdAt": "2026-09-27T09:00:00.000Z"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | the body is empty ("Nothing to update") or a field is invalid |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 403 | `FORBIDDEN` | you have read-only access |
| 404 | `NOT_FOUND` | no such share in this family |
| 429 | — | too many requests (plain-text body) |
| 500 | `INTERNAL_ERROR` | `id` is not a 24-character id |

</details>

<details>
<summary><code>DELETE /shares/:id</code> — Remove a share link</summary>

**Who can call:** write access (only the member who created the link, or a family admin) · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | The share's id. Not checked up front (see errors). |

**Query parameters:** none

**Body:** none

Deletes the link row for good (tidies the list); the link stops working. Its access log entries stay in the activity log.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 403 | `FORBIDDEN` | you have read-only access, or you are neither the link's creator nor a family admin |
| 404 | `NOT_FOUND` | no such share in this family |
| 429 | — | too many requests (plain-text body) |
| 500 | `INTERNAL_ERROR` | `id` is not a 24-character id |

</details>

<details>
<summary><code>GET /shares/:id/access-log</code> — See when a share link was opened or downloaded</summary>

**Who can call:** write access · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | The share's id. Not checked up front (see errors). |

**Query parameters:** none

**Body:** none

The last 200 opens and downloads, newest first. The visitor's IP address is never stored — only a one-way hash, so repeat visits from the same address can be spotted.

**Response** `200 OK`

```json
{
  "items": [
    {
      "time": "2026-09-27T11:20:00.000Z",
      "ipHash": "9b1c4e7a2f6d3b8c0a5e1d7f4c2b9a60",
      "device": "Android phone",
      "browser": "Chrome",
      "action": "share.open"
    }
  ]
}
```

`action` is `share.open` or `share.download`.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 403 | `FORBIDDEN` | you have read-only access |
| 404 | `NOT_FOUND` | no such share in this family |
| 429 | — | too many requests (plain-text body) |
| 500 | `INTERNAL_ERROR` | `id` is not a 24-character id |

</details>

---

## Public share pages

What a share link shows to someone without an account; the `:token` is the last part of the share `url`.

**Base path:** `/public`

<details>
<summary><code>GET /public/shares/:token</code> — Open a share link</summary>

**Who can call:** public · **Rate limit:** public limit (60 per 15 minutes) and the general API limit

**Headers:** none

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `token` | string | yes | The secret part of the share link (`…/s/<token>`) |

**Query parameters:** none

**Body:** none

Returns titles and files only — never notes, passwords, note items or internal ids other than file ids. Adds one to the link's open count and logs `share.open`.

**Response** `200 OK`

A document link:

```json
{
  "familyName": "The Sharma Family",
  "targetType": "document",
  "expiresAt": "2026-09-28T09:00:00.000Z",
  "document": {
    "title": "PAN card",
    "files": [
      {
        "id": "66f0c1a2b3c4d5e6f7a8b9c4",
        "label": "Front",
        "originalName": "pan-front.jpg",
        "url": "/api/files/<signed-token>",
        "thumbUrl": "/api/files/<signed-token>",
        "downloadUrl": "/api/files/<signed-token>?download=1",
        "mimeType": "image/jpeg",
        "size": 245780
      }
    ]
  }
}
```

A folder link has `folderTree` instead of `document`:

```json
{
  "familyName": "The Sharma Family",
  "targetType": "folder",
  "expiresAt": "2026-09-28T09:00:00.000Z",
  "folderTree": {
    "name": "Bank",
    "isSystem": false,
    "documents": [{ "title": "PAN card", "files": [] }],
    "subfolders": [{ "name": "Loans", "isSystem": false, "documents": [], "subfolders": [] }]
  }
}
```

File links are signed and last one hour; `thumbUrl` is `null` when there is no thumbnail. Files in the Bin are never included. Documents and subfolders are sorted by name.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 404 | `NOT_FOUND` | no link with this token, or the shared document or folder no longer exists (or is in the Bin) |
| 410 | `REVOKED` | the link was revoked |
| 410 | `EXPIRED` | the link has expired |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>POST /public/shares/:token/zip-link</code> — Download everything in a share link as a ZIP</summary>

**Who can call:** public · **Rate limit:** public limit (60 per 15 minutes) and the general API limit

**Headers:** none

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `token` | string | yes | The secret part of the share link (`…/s/<token>`) |

**Query parameters:** none

**Body:** none

Despite the name, this does not return a link: the response **is** the ZIP file. Adds one to the link's download count and logs `share.download` before the file starts streaming.

**Response** `200 OK` — a ZIP file.

- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="share.zip"`
- `X-Content-Type-Options: nosniff`
- Body: the decrypted files. For a document link each file is named `<label>-<file name>` (or just the file name when it has no label), limited to the shared `fileIds` if any. For a folder link the folder structure is kept: `<folder>/<document title>/<label or file name>`, for every subfolder. Files in the Bin are left out.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 404 | `NOT_FOUND` | no link with this token, the shared folder no longer exists (or is in the Bin), or there are no files to download |
| 410 | `REVOKED` | the link was revoked |
| 410 | `EXPIRED` | the link has expired |
| 429 | — | too many requests (plain-text body) |

</details>

---

## Bin

Deleting never removes anything for good: it moves it to the family's Bin, where any member can see it and a member with write access can put it back.

**Base path:** `/bin`

<details>
<summary><code>GET /bin</code> — List everything in the family's Bin</summary>

**Who can call:** family member · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

Documents, folders, items and single files deleted out of a document, in one list, most recently deleted first. No paging.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c4",
      "type": "file",
      "name": "Front",
      "originalName": "pan-front.jpg",
      "documentId": "66f0c1a2b3c4d5e6f7a8b9c3",
      "documentTitle": "PAN card",
      "documentDeleted": false,
      "deletedAt": "2026-09-27T10:00:00.000Z",
      "deletedBy": "66f0c1a2b3c4d5e6f7a8b9f0",
      "deletedByName": "Asha"
    },
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c0",
      "type": "item",
      "name": "SBI net banking",
      "deletedAt": "2026-09-26T18:30:00.000Z",
      "deletedBy": "66f0c1a2b3c4d5e6f7a8b9f0",
      "deletedByName": "Asha"
    }
  ]
}
```

`type` is `document`, `folder`, `item` or `file`. For a `file`, `id` is the file's own id and `name` is its label (or file name); `documentDeleted: true` means the whole document is in the Bin too. `deletedBy` is the member id of whoever deleted it (`null` for older entries) and `deletedByName` that member's current name.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>POST /bin/:type/:id/restore</code> — Restore one entry from the Bin</summary>

**Who can call:** write access · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `type` | enum | yes | `document`, `folder`, `item` or `file` |
| `id` | id | yes | 24-character id. For `file`, the file's own id. |

**Query parameters:** none

**Body:** none

What comes back with it:

- **document / item** — returns to its own folder; if that folder (or a folder above it) is in the Bin too, those folders are restored as well. If its folder was permanently deleted, it goes to the Shared folder.
- **folder** — comes back with everything that was deleted inside it (subfolders, documents, items), plus any deleted folders above it. If its parent was permanently deleted, it comes back at the top level.
- **file** — goes back into its document. If the document is in the Bin, the document is restored too (its other deleted files stay in the Bin).

Logs `document.restore`, `folder.restore`, `item.restore` or `document.file.restore`.

**Response** `200 OK`

For a document, folder or item:

```json
{ "restored": { "type": "item", "id": "66f0c1a2b3c4d5e6f7a8b9c0" } }
```

For a file:

```json
{
  "restored": {
    "type": "file",
    "id": "66f0c1a2b3c4d5e6f7a8b9c4",
    "documentId": "66f0c1a2b3c4d5e6f7a8b9c3",
    "documentRestored": false
  }
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `type` is not one of the four values, or `id` is not a 24-character id |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 403 | `FORBIDDEN` | you have read-only access |
| 404 | `NOT_IN_BIN` | nothing with this type and id is in this family's Bin |
| 429 | — | too many requests (plain-text body) |

</details>

---

## Activity

The family's activity log: who did what, and when.

**Base path:** `/activity`

<details>
<summary><code>GET /activity</code> — List the family's activity log</summary>

**Who can call:** write access · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters**

`memberId`, `action` and their `…Not` twins take one value or a comma-separated list (up to 100 values, blanks ignored). A plain filter keeps only those values; the `…Not` filter leaves them out. Example: `?memberId=a,b&actionNot=item.view`.

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `memberId` | comma list of ids | no | Only entries by these members (membership ids, 24 characters each) |
| `memberIdNot` | comma list of ids | no | Leave out entries by these members |
| `action` | comma list of strings | no | Only these actions, each 1 to 100 characters, e.g. `document.view,item.update` |
| `actionNot` | comma list of strings | no | Leave out these actions |
| `from` | date string | no | Entries at or after this time (ISO 8601). Not checked (see errors). |
| `to` | date string | no | Entries at or before this time (ISO 8601). Not checked (see errors). |
| `cursor` | string | no | `nextCursor` from the previous page |
| `limit` | number | no | Whole number, 1 to 100 (more is rejected). Default `20`. |

Action codes you will see: `auth.*` (login, logout, password changes), `family.*`, `member.*`, `folder.*`, `document.*` (including `document.view`, `document.file.add`, `document.file.delete`, `document.file.restore`), `item.*` (including `item.view`), `file.download`, `share.*` (`share.create`, `share.update`, `share.revoke`, `share.delete`, `share.open`, `share.download`), `bin.purge` and `admin.share.revoke`.

**Body:** none

**Response** `200 OK`

Newest first.

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9d0",
      "actorName": "Asha",
      "action": "share.create",
      "targetType": "document",
      "targetId": "66f0c1a2b3c4d5e6f7a8b9c3",
      "documentId": "66f0c1a2b3c4d5e6f7a8b9c3",
      "folderId": null,
      "shareId": "66f0c1a2b3c4d5e6f7a8b9e0",
      "meta": { "duration": "24h", "fileCount": null },
      "createdAt": "2026-09-27T09:00:00.000Z"
    }
  ],
  "nextCursor": "eyJ0IjoiMjAyNi0wOS0yN1QwOTowMDowMC4wMDBaIiwiaWQiOiI2NmYwYzFhMmIzYzRkNWU2ZjdhOGI5ZDAifQ"
}
```

`nextCursor` is `null` when there is nothing more. `actorName` is `Visitor` for someone opening a share link.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a query parameter is invalid, or `cursor` can't be read ("Invalid cursor") |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 403 | `FORBIDDEN` | you have read-only access |
| 429 | — | too many requests (plain-text body) |
| 500 | `INTERNAL_ERROR` | `from` or `to` is not a readable date |

</details>

---

## Stats

The counts on the family's Home screen.

**Base path:** `/stats`

<details>
<summary><code>GET /stats</code> — Get the Home screen counts</summary>

**Who can call:** family member · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `X-Family-Id: <familyId>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

Anything in the Bin is not counted (including single files moved to the Bin). Creates the family's Shared folder first if it is missing.

**Response** `200 OK`

```json
{
  "counts": {
    "documents": 12,
    "files": 20,
    "passwords": 8,
    "notes": 3,
    "folders": 5,
    "members": 4
  }
}
```

`files` = files in those documents, `passwords` = `login` items, `notes` = `note` items, `folders` includes the Shared folder, `members` counts every membership of the family (including invited and disabled ones).

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `MISSING_FAMILY_ID` | no `X-Family-Id` header |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_A_MEMBER` | you are not an active member of that family |
| 429 | — | too many requests (plain-text body) |

</details>

---

## Platform settings

Settings for the whole deployment (not one family), plus the cross-family Bin; no `X-Family-Id` is needed here.

**Base path:** `/platform-settings`

<details>
<summary><code>GET /platform-settings</code> — Read the platform settings</summary>

**Who can call:** public (a signed-in caller gets extra fields) · **Rate limit:** general API limit (300 per minute)

**Headers:** none required. An optional `Authorization: Bearer <accessToken>` adds the role fields below; a bad or expired token is treated as no token.

**Path parameters:** none

**Query parameters:** none

**Body:** none

The login page calls this before anyone is signed in, to know which sign-in buttons to show. The limits and `smtp.*` values are what is saved (`null` = not set, the server default is used). The SMTP password is never sent — only `hasPassword`.

**Response** `200 OK`

Example for a signed-in super admin:

```json
{
  "allowedLoginMethods": "both",
  "activityRetentionDays": null,
  "maxFileMB": 25,
  "storageLimitMB": null,
  "binRetentionDays": 90,
  "smtp": {
    "enabled": true,
    "host": "smtp-relay.example.com",
    "port": 587,
    "secure": false,
    "user": "mailer@example.com",
    "mailFrom": "Family Vault <no-reply@example.com>",
    "replyTo": null,
    "hasPassword": true
  },
  "isPlatformOwner": true,
  "platformRole": "super",
  "isPlatformAdmin": true,
  "canEditSettings": true,
  "canPurgeBin": true,
  "defaults": { "activityRetentionDays": 365, "maxFileMB": 20, "storageLimitMB": 512 },
  "storageDriver": "gridfs"
}
```

- **No token:** only `allowedLoginMethods`, the four limits and `smtp`.
- **Signed in:** also `isPlatformOwner` (= super admin), `platformRole` (`super`, `admin` or `null`), `isPlatformAdmin`, `canEditSettings` and `canPurgeBin`.
- **Platform admin:** also `defaults` (the server value each blank limit falls back to) and `storageDriver` (`gridfs`, `s3` or `local`).

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>PATCH /platform-settings</code> — Change the platform settings</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body**

Send only what changes; at least one field is required and unknown fields are rejected. Numbers may be sent as strings (`"30"`). `null` on a limit or an `smtp` field clears it back to the server default.

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `allowedLoginMethods` | enum | no | `google`, `password` or `both` — which sign-in methods the whole app accepts |
| `activityRetentionDays` | number or `null` | no | Whole number, 30 to 3650. How long new activity entries are kept. |
| `maxFileMB` | number or `null` | no | Whole number, 1 to 200. Largest file per upload. |
| `storageLimitMB` | number or `null` | no | Whole number, 100 or more. Storage per family; alert emails go out at 80% and 95%. |
| `binRetentionDays` | number or `null` | no | Whole number, 30 to 3650. Shown as guidance only — nothing is ever deleted automatically. |
| `smtp` | object | no | Outgoing email settings. Unknown keys inside are rejected. |
| `smtp.enabled` | boolean | no | The on/off switch for all outgoing email (saved details are kept when off) |
| `smtp.host` | string or `null` | no | Trimmed, at least 1 character |
| `smtp.port` | number or `null` | no | Whole number above 0 |
| `smtp.secure` | boolean or `null` | no | Use TLS from the start (usually `true` for port 465) |
| `smtp.user` | string or `null` | no | Trimmed, at least 1 character |
| `smtp.mailFrom` | string or `null` | no | Trimmed, at least 1 character, e.g. `Family Vault <no-reply@example.com>` |
| `smtp.replyTo` | string or `null` | no | Must contain an email address (`asha@example.com` or `Asha <asha@example.com>`) |
| `smtp.pass` | string or `null` | no | Left out = keep the saved password; `null` = clear it; a non-empty string = new password (stored encrypted, never returned) |

```json
{
  "maxFileMB": 25,
  "smtp": { "host": "smtp-relay.example.com", "port": 587, "secure": false }
}
```

The body is checked before the role, so a malformed body is a `400` for everyone.

**Response** `200 OK`

The saved settings with every admin field (same shape as the super admin example in `GET /platform-settings`).

```json
{
  "allowedLoginMethods": "both",
  "activityRetentionDays": null,
  "maxFileMB": 25,
  "storageLimitMB": null,
  "binRetentionDays": 90,
  "smtp": {
    "enabled": true,
    "host": "smtp-relay.example.com",
    "port": 587,
    "secure": false,
    "user": "mailer@example.com",
    "mailFrom": "Family Vault <no-reply@example.com>",
    "replyTo": null,
    "hasPassword": true
  },
  "defaults": { "activityRetentionDays": 365, "maxFileMB": 20, "storageLimitMB": 512 },
  "storageDriver": "gridfs",
  "isPlatformOwner": false,
  "platformRole": "admin",
  "isPlatformAdmin": true,
  "canEditSettings": true,
  "canPurgeBin": false
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | empty body, an unknown field, or a value out of range |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>GET /platform-settings/bin</code> — List the Bin across every family</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

Every family's Bin in one list, most recently deleted first. No paging. Unlike `GET /bin`, entries carry `familyId` and no `deletedBy`.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c4",
      "type": "file",
      "name": "Front",
      "originalName": "pan-front.jpg",
      "documentId": "66f0c1a2b3c4d5e6f7a8b9c3",
      "documentTitle": "PAN card",
      "documentDeleted": false,
      "familyId": "66f0c1a2b3c4d5e6f7a8b9a0",
      "deletedAt": "2026-09-27T10:00:00.000Z"
    },
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c5",
      "type": "document",
      "name": "Old ration card",
      "familyId": "66f0c1a2b3c4d5e6f7a8b9a0",
      "deletedAt": "2026-09-20T07:45:00.000Z"
    }
  ]
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>POST /platform-settings/bin/purge</code> — Permanently delete entries from the Bin</summary>

**Who can call:** super admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body**

Unknown fields are rejected.

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `items` | array | yes | At least 1 entry |
| `items[].type` | enum | yes | `document`, `folder`, `item` or `file` |
| `items[].id` | id | yes | 24-character id (for `file`, the file's own id) |

```json
{
  "items": [
    { "type": "document", "id": "66f0c1a2b3c4d5e6f7a8b9c5" },
    { "type": "file", "id": "66f0c1a2b3c4d5e6f7a8b9c4" }
  ]
}
```

**Cannot be undone.** The only route that deletes data for good: the database rows and, for documents, folders and files, the stored files and thumbnails (the family's used storage goes down). A folder takes its whole deleted subtree with it. Only entries that really are in a Bin can be purged. Each entry is handled on its own — one failure doesn't stop the rest. Logs `bin.purge` in the family's activity.

The body is checked before the role, so a malformed body is a `400` for everyone.

**Response** `200 OK`

```json
{
  "results": [
    { "type": "document", "id": "66f0c1a2b3c4d5e6f7a8b9c5", "purged": true },
    { "type": "file", "id": "66f0c1a2b3c4d5e6f7a8b9c4", "purged": false, "error": "NOT_IN_BIN" }
  ]
}
```

`error` (only when `purged` is `false`) is the failure code, usually `NOT_IN_BIN`.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `items` is missing or empty, an entry is invalid, or there is an unknown field |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `SUPER_ADMIN_ONLY` | you are not the super admin (added admins can't purge) |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>POST /platform-settings/test-email</code> — Send a test email to yourself</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

Sends a test email to **your own** address (never another one) with the current mail settings, in your language, and reports what really happened. Logs `admin.test_email`.

**Response** `200 OK` — also when sending failed; check `ok`.

Sent:

```json
{ "ok": true, "queued": true, "emailEnabled": true, "to": "asha@example.com" }
```

Not sent:

```json
{
  "ok": false,
  "queued": false,
  "emailEnabled": true,
  "to": "asha@example.com",
  "error": "SEND_FAILED",
  "code": "EAUTH",
  "hint": "The mail server refused the username or password. For Brevo use your SMTP login and an SMTP key (not your account password)."
}
```

`error` is `EMAIL_DISABLED` (no SMTP host set — `emailEnabled: false`), `EMAIL_TURNED_OFF` (email switched off in the admin panel — `emailEnabled: false`) or `SEND_FAILED` (the mail server refused or couldn't be reached; `code` is the mail error such as `EAUTH`, `ETIMEDOUT` or `ENOTFOUND`). `hint` says what to fix.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

---

## Admin panel

The admin panel for the people who run the app: every route needs a platform admin (no `X-Family-Id`), and answers hold metadata only (names, emails, counts, sizes, dates, titles) — never file contents, file links, passwords, notes or share tokens.

**Base path:** `/admin`

### Admin: Overview

<details>
<summary><code>GET /admin/me</code> — Get your admin role</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

**Response** `200 OK`

```json
{ "email": "asha@example.com", "role": "admin", "isSuperAdmin": false }
```

`role` is `super` or `admin`.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>GET /admin/overview</code> — Get app-wide totals and recent activity</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

**Response** `200 OK`

```json
{
  "counts": {
    "users": 42,
    "activeUsers30d": 30,
    "disabledUsers": 1,
    "families": 15,
    "members": 48,
    "invitesPending": 3,
    "documents": 310,
    "files": 520,
    "passwords": 120,
    "notes": 35,
    "folders": 60,
    "sharesActive": 4,
    "sharesTotal": 57
  },
  "storage": {
    "totalBytes": 734003200,
    "topFamilies": [
      { "id": "66f0c1a2b3c4d5e6f7a8b9a0", "name": "The Sharma Family", "bytes": 157286400 }
    ]
  },
  "signups": { "last7d": 2, "last30d": 9 },
  "recentActivity": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9d0",
      "at": "2026-09-27T09:00:00.000Z",
      "action": "document.create",
      "actor": { "id": "66f0c1a2b3c4d5e6f7a8b9b0", "name": "Asha", "email": "asha@example.com" },
      "family": { "id": "66f0c1a2b3c4d5e6f7a8b9a0", "name": "The Sharma Family" },
      "targetType": "document",
      "targetTitle": "PAN card"
    }
  ]
}
```

- `activeUsers30d` = signed in within 30 days. `members` leaves out invited people; `invitesPending` counts them. `documents`, `files`, `passwords`, `notes` and `folders` leave out the Bin. `sharesActive` = not revoked and not expired.
- `topFamilies` = the 5 families using the most storage. `signups` = accounts created in the last 7 and 30 days.
- `recentActivity` = the last 10 entries across the app. `actor` is `null` for a share-link visitor; `actor.id` / `email` are `null` when the actor has no account. `family` is `null` for admin actions that belong to no family. `targetTitle` is a plain label or `null`.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

### Admin: Users

<details>
<summary><code>GET /admin/users</code> — List accounts</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `q` | string | no | Trimmed, up to 200 characters. Matches part of the name or email, any case. |
| `status` | enum | no | `all`, `active` or `disabled`. Default `all`. |
| `page` | number | no | Whole number, 1 or more. Default `1`. |
| `limit` | number | no | Whole number, 1 or more. Default `20`; above 100 is cut to 100. |

Newest account first.

**Body:** none

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9b0",
      "name": "Asha Sharma",
      "email": "asha@example.com",
      "createdAt": "2026-08-01T12:00:00.000Z",
      "lastLoginAt": "2026-09-27T08:55:00.000Z",
      "disabled": false,
      "authProviders": ["password", "google"],
      "isSuperAdmin": false,
      "isAdmin": false,
      "families": [
        { "id": "66f0c1a2b3c4d5e6f7a8b9a0", "name": "The Sharma Family", "role": "admin", "access": "write" }
      ]
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

`families` lists the families the person has joined (not pending invites). `isAdmin` = added in Admin → Admins.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a query parameter is invalid |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>GET /admin/users/:id</code> — Get one account</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | 24-character user id |

**Query parameters:** none

**Body:** none

**Response** `200 OK`

```json
{
  "user": {
    "id": "66f0c1a2b3c4d5e6f7a8b9b0",
    "name": "Asha Sharma",
    "email": "asha@example.com",
    "createdAt": "2026-08-01T12:00:00.000Z",
    "lastLoginAt": "2026-09-27T08:55:00.000Z",
    "disabled": false,
    "authProviders": ["password"],
    "isSuperAdmin": false,
    "isAdmin": false,
    "families": [
      { "id": "66f0c1a2b3c4d5e6f7a8b9a0", "name": "The Sharma Family", "role": "admin", "access": "write" }
    ]
  },
  "activeSessions": 2,
  "recentActivity": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9d1",
      "at": "2026-09-27T08:55:00.000Z",
      "action": "auth.login",
      "actor": { "id": "66f0c1a2b3c4d5e6f7a8b9b0", "name": "Asha", "email": "asha@example.com" },
      "family": { "id": "66f0c1a2b3c4d5e6f7a8b9a0", "name": "The Sharma Family" },
      "targetType": "user",
      "targetTitle": null
    }
  ]
}
```

`activeSessions` = signed-in devices that haven't expired. `recentActivity` = the last 20 entries by this person in any family, admin actions they took, and admin actions done to them.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` is not a 24-character id |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 404 | `NOT_FOUND` | no such user |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>PATCH /admin/users/:id</code> — Disable or enable an account</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | 24-character user id |

**Query parameters:** none

**Body**

Unknown fields are rejected.

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `disabled` | boolean | yes | `true` disables the account, `false` enables it |

```json
{ "disabled": true }
```

Disabling also signs the person out on every device at once. A disabled account can't sign in or use the API. Logs `admin.user.disable` or `admin.user.enable` (nothing is logged when the value doesn't change). Not allowed on the super admin or on yourself.

**Response** `200 OK`

The updated account row.

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9b0",
  "name": "Asha Sharma",
  "email": "asha@example.com",
  "createdAt": "2026-08-01T12:00:00.000Z",
  "lastLoginAt": "2026-09-27T08:55:00.000Z",
  "disabled": true,
  "authProviders": ["password"],
  "isSuperAdmin": false,
  "isAdmin": false,
  "families": [
    { "id": "66f0c1a2b3c4d5e6f7a8b9a0", "name": "The Sharma Family", "role": "admin", "access": "write" }
  ]
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` is invalid, `disabled` is missing or not a boolean, or there is an unknown field |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 403 | `SUPER_ADMIN_PROTECTED` | the account is the super admin |
| 403 | `CANNOT_MODIFY_SELF` | the account is your own |
| 404 | `NOT_FOUND` | no such user |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>POST /admin/users/:id/logout-all</code> — Sign an account out everywhere</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | 24-character user id |

**Query parameters:** none

**Body:** none

Ends every session of the account, including access tokens already in use. Allowed on yourself (you will be signed out too), not on the super admin. Logs `admin.user.logout_all`.

**Response** `200 OK`

```json
{ "revoked": 2 }
```

`revoked` = how many signed-in devices were ended.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` is not a 24-character id |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 403 | `SUPER_ADMIN_PROTECTED` | the account is the super admin |
| 404 | `NOT_FOUND` | no such user |
| 429 | — | too many requests (plain-text body) |

</details>

### Admin: Families

<details>
<summary><code>GET /admin/families</code> — List families</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `q` | string | no | Trimmed, up to 200 characters. Matches part of the family name, any case. |
| `page` | number | no | Whole number, 1 or more. Default `1`. |
| `limit` | number | no | Whole number, 1 or more. Default `20`; above 100 is cut to 100. |

Newest family first.

**Body:** none

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9a0",
      "name": "The Sharma Family",
      "createdAt": "2026-08-01T12:05:00.000Z",
      "owner": { "id": "66f0c1a2b3c4d5e6f7a8b9b0", "name": "Asha Sharma", "email": "asha@example.com" },
      "members": 4,
      "documents": 25,
      "files": 41,
      "passwords": 10,
      "notes": 3,
      "folders": 6,
      "storageBytes": 157286400,
      "lastActivityAt": "2026-09-27T09:00:00.000Z"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

`owner` is the family owner (or its creator), `null` if not found. `members` leaves out pending invites; the other counts leave out the Bin. `lastActivityAt` is `null` when there is no activity.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a query parameter is invalid |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>GET /admin/families/:id</code> — Get one family with its members</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | 24-character family id |

**Query parameters:** none

**Body:** none

**Response** `200 OK`

```json
{
  "family": {
    "id": "66f0c1a2b3c4d5e6f7a8b9a0",
    "name": "The Sharma Family",
    "createdAt": "2026-08-01T12:05:00.000Z",
    "owner": { "id": "66f0c1a2b3c4d5e6f7a8b9b0", "name": "Asha Sharma", "email": "asha@example.com" },
    "members": 4,
    "documents": 25,
    "files": 41,
    "passwords": 10,
    "notes": 3,
    "folders": 6,
    "storageBytes": 157286400,
    "lastActivityAt": "2026-09-27T09:00:00.000Z"
  },
  "members": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9f0",
      "userId": "66f0c1a2b3c4d5e6f7a8b9b0",
      "name": "Asha",
      "email": "asha@example.com",
      "role": "admin",
      "access": "write",
      "status": "active",
      "joinedAt": "2026-08-01T12:05:00.000Z"
    }
  ],
  "recentActivity": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9d0",
      "at": "2026-09-27T09:00:00.000Z",
      "action": "document.create",
      "actor": { "id": "66f0c1a2b3c4d5e6f7a8b9b0", "name": "Asha", "email": "asha@example.com" },
      "family": { "id": "66f0c1a2b3c4d5e6f7a8b9a0", "name": "The Sharma Family" },
      "targetType": "document",
      "targetTitle": "PAN card"
    }
  ]
}
```

`members` includes every membership, oldest first (`status` can be `active`, `invited` or `disabled`); `userId` is `null` and `email` is the invited address for someone who hasn't joined yet. `recentActivity` = the family's last 20 entries.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` is not a 24-character id |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 404 | `NOT_FOUND` | no such family |
| 429 | — | too many requests (plain-text body) |

</details>

### Admin: Activity

<details>
<summary><code>GET /admin/activity</code> — List activity across every family</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters**

`familyId`, `action` and their `…Not` twins take one value or a comma-separated list (up to 100 values, blanks ignored). A plain filter keeps only those values; the `…Not` filter leaves them out. Example: `?familyId=a,b&actionNot=document.view,item.view`.

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `familyId` | comma list of ids | no | Only these families (24 characters each) |
| `familyIdNot` | comma list of ids | no | Leave out these families |
| `userId` | id | no | One person: what they did in any family, admin actions they took, and admin actions done to them |
| `action` | comma list of strings | no | Only these actions, each trimmed, 1 to 100 characters, e.g. `admin.user.disable,auth.login` |
| `actionNot` | comma list of strings | no | Leave out these actions |
| `from` | date string | no | Entries at or after this time. Must be a readable date (ISO 8601). |
| `to` | date string | no | Entries at or before this time. Must be a readable date (ISO 8601). |
| `cursor` | string | no | `nextCursor` from the previous page, up to 500 characters |
| `limit` | number | no | Whole number, 1 or more. Default `50`; above 100 is cut to 100. |

Admin-only action codes: `admin.user.disable`, `admin.user.enable`, `admin.user.logout_all`, `admin.share.revoke`, `admin.admin.add`, `admin.admin.remove`, `admin.test_email`.

**Body:** none

**Response** `200 OK`

Newest first.

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9d2",
      "at": "2026-09-27T10:30:00.000Z",
      "action": "admin.user.disable",
      "actor": { "id": "66f0c1a2b3c4d5e6f7a8b9b1", "name": "Ravi", "email": "ravi@example.com" },
      "family": null,
      "targetType": "user",
      "targetTitle": "asha@example.com"
    }
  ],
  "nextCursor": "eyJ0IjoiMjAyNi0wOS0yN1QxMDozMDowMC4wMDBaIiwiaWQiOiI2NmYwYzFhMmIzYzRkNWU2ZjdhOGI5ZDIifQ"
}
```

`nextCursor` is `null` when there is nothing more. `actor` is `null` for a share-link visitor; `family` is `null` for admin actions that belong to no family.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a query parameter is invalid (including an unreadable date), or `cursor` can't be read ("Invalid cursor") |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

### Admin: Shares

<details>
<summary><code>GET /admin/shares</code> — List share links across families</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `status` | enum | no | `active`, `expired`, `revoked` or `all`. Default `all`. |
| `familyId` | id | no | 24-character id. Only this family's links. |
| `page` | number | no | Whole number, 1 or more. Default `1`. |
| `limit` | number | no | Whole number, 1 or more. Default `20`; above 100 is cut to 100. |

Newest first.

**Body:** none

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9e0",
      "family": { "id": "66f0c1a2b3c4d5e6f7a8b9a0", "name": "The Sharma Family" },
      "targetType": "document",
      "targetTitle": "PAN card",
      "createdBy": { "name": "Asha", "email": "asha@example.com" },
      "createdAt": "2026-09-27T09:00:00.000Z",
      "expiresAt": "2026-09-28T09:00:00.000Z",
      "revokedAt": null,
      "opens": 3,
      "lastOpenedAt": "2026-09-27T11:20:00.000Z",
      "hasPassword": false,
      "status": "active"
    }
  ],
  "total": 57,
  "page": 1,
  "limit": 20
}
```

`targetTitle` still shows when the target is in the Bin. `createdBy` is `null` if the creating member was removed. `hasPassword` is always `false` (links have no password option).

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | a query parameter is invalid |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>POST /admin/shares/:id/revoke</code> — Turn off any share link</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | 24-character share id |

**Query parameters:** none

**Body:** none

The link stops working at once. Logs `admin.share.revoke`, which also shows in that family's activity log. Revoking an already revoked link changes nothing and returns it as it is.

**Response** `200 OK`

The share row (same shape as in `GET /admin/shares`).

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9e0",
  "family": { "id": "66f0c1a2b3c4d5e6f7a8b9a0", "name": "The Sharma Family" },
  "targetType": "document",
  "targetTitle": "PAN card",
  "createdBy": { "name": "Asha", "email": "asha@example.com" },
  "createdAt": "2026-09-27T09:00:00.000Z",
  "expiresAt": "2026-09-28T09:00:00.000Z",
  "revokedAt": "2026-09-27T12:00:00.000Z",
  "opens": 3,
  "lastOpenedAt": "2026-09-27T11:20:00.000Z",
  "hasPassword": false,
  "status": "revoked"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` is not a 24-character id |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 404 | `NOT_FOUND` | no such share |
| 429 | — | too many requests (plain-text body) |

</details>

### Admin: Admins

<details>
<summary><code>GET /admin/admins</code> — List the super admin and every admin</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

**Response** `200 OK`

```json
{
  "superAdmin": { "email": "owner@example.com", "name": "Owner Name" },
  "admins": [
    {
      "id": "66f0c1a2b3c4d5e6f7a8b9c9",
      "email": "ravi@example.com",
      "name": "Ravi",
      "addedBy": { "email": "owner@example.com" },
      "addedAt": "2026-09-01T10:00:00.000Z"
    }
  ]
}
```

The super admin comes from the server settings (`SUPER_ADMIN_EMAIL`) and is not in `admins`. `superAdmin.email` is `null` if none is set. `name` is `null` until that email has an account. `admins` is oldest first; `addedBy` is `null` when unknown.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>POST /admin/admins</code> — Add an admin</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: application/json`

**Path parameters:** none

**Query parameters:** none

**Body**

Unknown fields are rejected.

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `email` | string | yes | A valid email address; trimmed and lowercased. It doesn't need an account yet — whoever signs in with it becomes an admin. |

```json
{ "email": "ravi@example.com" }
```

Logs `admin.admin.add`.

**Response** `201 Created`

```json
{
  "id": "66f0c1a2b3c4d5e6f7a8b9c9",
  "email": "ravi@example.com",
  "name": "Ravi",
  "addedBy": { "email": "owner@example.com" },
  "addedAt": "2026-09-27T12:10:00.000Z"
}
```

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `email` is missing or not a valid address, or there is an unknown field |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 409 | `IS_SUPER_ADMIN` | this email is already the super admin |
| 409 | `ALREADY_ADMIN` | this email is already an admin |
| 429 | — | too many requests (plain-text body) |

</details>

<details>
<summary><code>DELETE /admin/admins/:id</code> — Remove an admin</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters**

| Name | Type | Required | Rules / notes |
| --- | --- | --- | --- |
| `id` | id | yes | 24-character admin id (the `id` from `GET /admin/admins`, not a user id) |

**Query parameters:** none

**Body:** none

The person loses admin access on their next request. The super admin is not in this list, so it can never be removed. Logs `admin.admin.remove`.

**Response** `204 No Content` — empty body.

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `id` is not a 24-character id |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 404 | `NOT_FOUND` | no admin with this id |
| 429 | — | too many requests (plain-text body) |

</details>

### Admin: System

<details>
<summary><code>GET /admin/system</code> — Get server and database health details</summary>

**Who can call:** platform admin · **Rate limit:** general API limit (300 per minute)

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameters:** none

**Query parameters:** none

**Body:** none

**Response** `200 OK`

```json
{
  "app": {
    "commit": "5eb18bf0c2d4e6a8b0c2d4e6f8a0b2c4d6e8f0a2",
    "nodeVersion": "v20.20.0",
    "uptimeSec": 86400,
    "nodeEnv": "production"
  },
  "config": {
    "storageDriver": "gridfs",
    "emailEnabled": true,
    "emailSwitchedOff": false,
    "smtpHost": "smtp-relay.example.com",
    "allowedLoginMethods": "both"
  },
  "db": {
    "dataSizeBytes": 52428800,
    "storageSizeBytes": 67108864,
    "indexSizeBytes": 4194304,
    "collections": { "activities": 5230, "documents": 310, "families": 15, "users": 42 }
  },
  "memory": { "rssBytes": 157286400, "heapUsedBytes": 73400320 }
}
```

- `commit` comes from Render's `RENDER_GIT_COMMIT` (`null` elsewhere).
- `smtpHost` is the saved host, or the server's `SMTP_HOST` when none is saved. `emailEnabled` = a host is set and email isn't switched off. The SMTP password is never read.
- `collections` = the estimated number of records in every collection, sorted by name (trimmed here).

**Errors**

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | no bearer token |
| 401 | `INVALID_TOKEN` | the access token is bad or expired, or the account no longer exists |
| 401 | `SESSION_REVOKED` | the account was signed out everywhere after this token was issued |
| 403 | `ACCOUNT_DISABLED` | the account is disabled |
| 403 | `NOT_PLATFORM_ADMIN` | you are not the super admin or an admin |
| 429 | — | too many requests (plain-text body) |

</details>

---

## Examples

Log in, then list folders and upload a document. Replace the `<…>` placeholders with your own values.

```bash
# 1. Log in. Keep accessToken, refreshToken and a memberships[].familyId from the answer.
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"<your-password>"}'

# 2. List every folder in one family.
curl http://localhost:5000/api/folders/tree \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Family-Id: <familyId>"

# 3. Upload a document with two photos into a folder.
curl -X POST http://localhost:5000/api/documents \
  -H "Authorization: Bearer <accessToken>" \
  -H "X-Family-Id: <familyId>" \
  -F 'data={"title":"Aadhaar card","folderId":"<folderId>"}' \
  -F 'labels=["Front","Back"]' \
  -F "files=@aadhaar-front.jpg" \
  -F "files=@aadhaar-back.jpg"

# 4. When the access token has expired (401), get a new pair.
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

Longer notes on some routes are in [API.md](API.md) (the app) and [ADMIN_API.md](ADMIN_API.md)
(the admin panel); where they disagree with this page, this page follows the code.
