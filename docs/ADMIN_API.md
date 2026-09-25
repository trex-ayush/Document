# Admin panel (`/admin`) — roles and API contract

## Roles
- **Super admin**: the email in env `SUPER_ADMIN_EMAIL` (falls back to the existing `PLATFORM_OWNER_EMAIL`, so current deployments keep working). Exactly one. Not stored in the DB, so it can never be removed, disabled or demoted by anyone through the app.
- **Admins**: stored in the `PlatformAdmin` collection (`{ email (unique, lowercase), addedBy (userId), createdAt }`). An admin is whoever logs in with that email.
- **Who can do what**
  | Action | Super admin | Admin |
  |---|---|---|
  | View every admin page (overview, users, families, activity, shares, system, admins, settings) | ✅ | ✅ |
  | Disable / enable a user, log a user out everywhere | ✅ | ✅ (never the super admin, never themselves) |
  | Revoke any share link | ✅ | ✅ |
  | Add / remove admins | ✅ | ✅ (can never remove the super admin) |
  | Change platform settings (sign-in methods, email/SMTP, limits), purge the bin | ✅ | ❌ (read-only) |
- **Privacy rule (vault app)**: admin endpoints return METADATA only — names, emails, counts, sizes, dates, titles, action names. They never return file bytes or file URLs, decrypted custom-field/password/note values, share tokens, password hashes, or SMTP passwords.
- Every admin mutation is written to the activity log with `action: 'admin.*'` and the acting admin.

## API (all under `/api/admin`, require login; 403 `NOT_PLATFORM_ADMIN` otherwise)
- `GET /me` → `{ email, role: 'super' | 'admin', isSuperAdmin }`
- `GET /overview` → `{ counts: { users, activeUsers30d, disabledUsers, families, members, invitesPending, documents, files, passwords, notes, folders, sharesActive, sharesTotal }, storage: { totalBytes, topFamilies: [{ id, name, bytes }] }, signups: { last7d, last30d }, recentActivity: [ActivityRow ×10] }`
- `GET /users?q=&status=all|active|disabled&page=1&limit=20` → `{ items: [UserRow], total, page, limit }`
  - `UserRow = { id, name, email, createdAt, lastLoginAt, disabled, authProviders, isSuperAdmin, isAdmin, families: [{ id, name, role, access }] }`
- `GET /users/:id` → `{ user: UserRow, activeSessions, recentActivity: [ActivityRow ×20] }`
- `PATCH /users/:id` `{ disabled: boolean }` → `UserRow` (403 for the super admin or yourself)
- `POST /users/:id/logout-all` → `{ revoked: number }`
- `GET /families?q=&page=1&limit=20` → `{ items: [FamilyRow], total, page, limit }`
  - `FamilyRow = { id, name, createdAt, owner: { id, name, email }, members, documents, files, passwords, notes, folders, storageBytes, lastActivityAt }`
- `GET /families/:id` → `{ family: FamilyRow, members: [{ id, userId, name, email, role, access, status, joinedAt }], recentActivity: [ActivityRow ×20] }`
- `GET /activity?familyId=&userId=&action=&from=&to=&cursor=&limit=50` → `{ items: [ActivityRow], nextCursor }`
  - `ActivityRow = { id, at, action, actor: { id, name, email } | null, family: { id, name } | null, targetType, targetTitle }`
- `GET /shares?status=active|expired|revoked|all&familyId=&page=1&limit=20` → `{ items: [ShareRow], total, page, limit }`
  - `ShareRow = { id, family: { id, name }, targetType, targetTitle, createdBy: { name, email }, createdAt, expiresAt, revokedAt, opens, lastOpenedAt, hasPassword, status }`
- `POST /shares/:id/revoke` → `ShareRow`
- `GET /system` → `{ app: { commit, nodeVersion, uptimeSec, nodeEnv }, config: { storageDriver, emailEnabled, smtpHost, allowedLoginMethods }, db: { dataSizeBytes, storageSizeBytes, indexSizeBytes, collections: { [name]: count } }, memory: { rssBytes, heapUsedBytes } }` (`commit` from `RENDER_GIT_COMMIT` when set)
- `GET /admins` → `{ superAdmin: { email, name? }, admins: [{ id, email, name?, addedBy: { email } | null, addedAt }] }`
- `POST /admins` `{ email }` → admin row (400 invalid email, 409 already an admin or it is the super admin)
- `DELETE /admins/:id` → `204` (the super admin is not in this list, so it can't be removed)

### Implementation notes (server)
- `limit` above 100 is capped to 100 (not rejected). `q` is matched case-insensitively as plain text (regex characters are escaped).
- `UserRow.isAdmin` = the email is in the `PlatformAdmin` collection; the super admin has `isSuperAdmin: true` (and normally `isAdmin: false`).
- `ShareRow.hasPassword` is always `false` (share links have no password option in this app). `ShareRow.createdBy` may be `null` if the creating membership was removed.
- `ActivityRow.actor` is `null` for public visitors; `actor.id`/`email` are `null` when the actor has no linked account. Admin actions show the acting admin.
- Error codes: `403 NOT_PLATFORM_ADMIN` (not an admin), `403 SUPER_ADMIN_ONLY` (platform-settings PATCH / bin), `403 SUPER_ADMIN_PROTECTED` (disable/log out the super admin), `403 CANNOT_MODIFY_SELF` (disable yourself), `409 IS_SUPER_ADMIN` / `409 ALREADY_ADMIN` (`POST /admins`), `404 NOT_FOUND`, `400 VALIDATION_ERROR`.
- Disabling a user also ends all their sessions. Logging yourself out everywhere is allowed.
- Admin actions are logged as `admin.user.disable`, `admin.user.enable`, `admin.user.logout_all`, `admin.share.revoke`, `admin.admin.add`, `admin.admin.remove`. Only `admin.share.revoke` belongs to a family (it also appears in that family's activity log); the others have no family and only show in `GET /api/admin/activity`.

## Existing endpoints
- `GET /api/platform-settings` additionally returns `platformRole: 'super' | 'admin' | null` and `isPlatformAdmin` for a logged-in caller (keeps `isPlatformOwner` = super admin for backward compatibility).
- `PATCH /api/platform-settings` and bin purge stay **super admin only**.

## Client
- Routes: `/admin` (Overview), `/admin/users`, `/admin/families`, `/admin/activity`, `/admin/shares`, `/admin/admins`, `/admin/settings` (the old Platform Settings content), `/admin/system`. `/platform-settings` redirects to `/admin/settings`.
- The nav shows "Admin" (to `/admin`) for super admin and admins.
- i18n namespaces: `admin` (layout, overview, users, families, admins) and `adminOps` (activity, shares, system, settings page chrome).
