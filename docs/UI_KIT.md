# UI Kit — client frontend foundation

Everything under `client/src/components/**`, `client/src/context/**`, `client/src/services/**`
(except `itemsApi.js`), `client/src/hooks/**`, `client/src/pages/auth/**`, and
`client/src/routes/ProtectedRoute.jsx`. A summary of the shared building blocks; each file's
top-of-file comment is the source of truth if something here goes stale.

Ported from `C:/Users/Sir/Downloads/pabbly-frontend-ai-starter`: primitives/layout/dark-mode from
`apps/template` (already plain JSX), `apiClient`/`AuthContext`/`ThemeContext`/`Modal`/`Drawer`/
`Dropdown`/`Tabs`/`Switch`/`ConfirmModal`/`FileDropzone`/`FormField`/`Textarea`/`Skeleton` hand-ported
from `apps/component` (TS, types stripped). Every file's top-of-file comment says exactly what
was ported from where and what changed — this doc summarizes those comments so you don't have to
open the files, but the comments are the source of truth if something here goes stale.

**Two dependencies the reference implementations used are NOT in `docs/DECISIONS.md`'s client
dependency list, so they were not used**: `focus-trap-react` (Modal/Drawer use a local
`useFocusTrap` hook instead) and `react-dropzone` (FileDropzone is native HTML5 drag/drop
instead). Functionally equivalent, documented per-component below.

---

## 1. Contexts

### `ThemeContext` — `client/src/context/ThemeContext.jsx`

`{ theme, isDark, isLight, setTheme(mode), toggleTheme() }`. Persists to `localStorage` under the
**exact key `family-vault-theme`** (matches `client/index.html`'s pre-mount script byte-for-byte —
do not change one without the other) and toggles the `dark` class on `<html>`. Default (nothing
saved yet) follows OS `prefers-color-scheme` and keeps following it live until the user explicitly
toggles in-app.

```jsx
import { useTheme } from '@/context/ThemeContext.jsx';
const { theme, setTheme } = useTheme(); // setTheme('light' | 'dark')
```
The UI sets a specific mode through `ThemeSwitcher` (§7.6), never a blind toggle.

Wrap once in `main.jsx` (already done): `<ThemeProvider>`.

### `AuthContext` — `client/src/context/AuthContext.jsx`

`{ user, memberships, activeFamilyId, activeMembership, activeFamily, membership, family,
isAuthenticated, loading, login, signup, loginWithGoogle, completeGoogleSignup, acceptInvite,
switchFamily, createFamily, logout, logoutAll, updateUser }` (`membership`/`family` are aliases for
the active ones).

- `loading` is `true` only during the mount-time `GET /auth/me` check — `ProtectedRoute` shows a
  spinner meanwhile, so a refresh never flashes the login page. A failed `/auth/me` only signs out on
  a 401/403; a dropped connection or a 429 keeps the cached session.
- **Idle sign-out**: 60 minutes without real activity (pointer, keys, touch, scroll — shared across
  tabs through `localStorage` `family-vault-last-activity`, `services/idleSession.js`) signs the person
  out quietly to the normal login page, with no notice. A stored session that is already idle when
  the app opens is dropped without refreshing it. The server enforces the same hour
  (`401 SESSION_EXPIRED` on refresh), which the API client also treats as a quiet sign-out.
- `logout()` revokes the refresh token server-side (best effort; works without a live access token)
  and clears local state. `logoutAll()` revokes every refresh token for the user.

```jsx
import { useAuth } from '@/context/AuthContext.jsx';
const { user, isAuthenticated, logout } = useAuth();
```

---

## 2. Services (`client/src/services/*.js`)

One function per `docs/API.md` endpoint (except `/items/*` — Items agent's `itemsApi.js`). Every
function is `apiClient.<verb>(url, ...).then(res => res.data)` — thin, no business logic. Full
endpoint-by-endpoint mapping is in each file's top comment; only non-obvious behavior is called
out here.

| File | Covers | Notes |
|---|---|---|
| `config/env.js` | `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID` | `apiBaseUrl` already includes `/api` — never prefix service calls with `/api`. `googleClientId` is `''` when unset. |
| `services/storage.js` | `localStorage` wrapper + `STORAGE_KEYS` | `get/set/remove` (JSON) and `getRaw/setRaw` (raw strings, for tokens). Never throws. |
| `services/apiClient.js` | axios instance | Bearer + `X-Family-Id` attach, refresh-on-401 with a single-flight queue (see §3). |
| `services/idleSession.js` | idle sign-out | `markActivity`, `isIdleExpired`, `startIdleWatch(onIdle)` — 60 minutes, shared across tabs. |
| `services/authApi.js` | `/auth/*` | |
| `services/membersApi.js` | `/members` | `create({ name, email })` — new members are invited with write access. |
| `services/familyApi.js` | `/family` | `get()` includes `defaultShareDuration`; `update({ name?, defaultShareDuration? })`. |
| `services/foldersApi.js` | `/folders/*` | `tree()`, `browse(folderId?)`, `create`, `update` (rename/move; `parentId: 'root'` = top level), `remove(id, { confirm })` (first call returns the counts to warn about). |
| `services/documentsApi.js` | `/documents/*` | `create({ data: { title, folderId?, notes? }, files })` and `addFiles` are multipart and take `{ onUploadProgress }`; `removeFile` (never the last one — `LAST_FILE`); `zipLink`. |
| `services/itemsApi.js` | `/items/*` | Passwords and notes — docs/ITEMS.md. |
| `services/searchApi.js` | `/search` | `search({ q, folderId?, limit? }, { signal })` — grouped `{ folders, documents, items }`. |
| `services/filesApi.js` | `/files/:signedToken` (URL helpers only) | `resolveUrl` prefixes a relative signed URL with the API origin; `getForceDownloadUrl`; `triggerDownload(url, filename)`. |
| `services/sharesApi.js` | `/shares/*` | `create({ targetType, targetId, fileIds?, duration? })` — the only time the raw link `url` is returned; `revoke(id)`; `remove(id)`. |
| `services/publicApi.js` | `/public/*` | Bare axios (no bearer, never triggers the refresh interceptor). |
| `services/binApi.js` | `/bin` | `list()`, `restore(type, id)`. |
| `services/activityApi.js` | `/activity` | Cursor pagination (`cursor`/`nextCursor`). |
| `services/statsApi.js` | `/stats` | `{ counts: { documents, passwords, notes, folders, members } }`. |
| `services/meApi.js`, `platformApi.js` | `/me/notification-prefs`, `/platform-settings` | |

---

## 3. `apiClient` — `client/src/services/apiClient.js`

Axios instance, `baseURL: env.apiBaseUrl`. Request interceptor attaches
`Authorization: Bearer <accessToken>` from `storage`. Response interceptor: on a `401` (not from
`/auth/login`, `/auth/signup`, or `/auth/refresh` themselves, and not already retried), refreshes
once via a **single-flight queue** — concurrent 401s all await the same in-flight
`POST /auth/refresh` call instead of each firing their own — then retries the original request with
the new token. **Our shape**: `POST /auth/refresh` takes `{ refreshToken }` and returns
`{ accessToken, refreshToken }` (not `{ token, refreshToken }` like the `apps/component` reference
— check `docs/API.md` if this ever needs re-porting). On refresh failure (no refresh token, or the
refresh call itself fails — including `401 SESSION_EXPIRED` after an idle hour), clears the stored
session and dispatches a `window` `auth:logout` event — `AuthContext` listens for it and clears the
session, and `ProtectedRoute` sends the person to `/login` with no message. If the session is already
idle when a 401 arrives, it signs out instead of refreshing.

```jsx
import { apiClient } from '@/services/apiClient.js';
// Prefer the typed *Api.js wrappers above over calling apiClient directly.
```

---

## 4. Hooks (`client/src/hooks/*.js`)

| Hook | Signature | Use |
|---|---|---|
| `useClickOutside` | `(ref, handler, enabled = true)` | Closes a popover/dropdown/menu on outside pointerdown/touchstart. Used by `Dropdown` and the "+ Add" popover. |
| `useIsMobile` | `(breakpoint = 1024) => boolean` | True below the given breakpoint (default matches Tailwind's `lg`). Used by `Modal` (bottom-sheet switch) and "+ Add" (popover vs. bottom sheet). |
| `useDebouncedValue` | `(value, delayMs = 300)` | Debounces search boxes so each keystroke doesn't fire a request. |
| `useInfiniteScroll` | | Loads the next page when a sentinel scrolls into view (Activity). |
| `useFocusTrap` | `(panelRef, isOpen, { onClose, closeOnEscape = true })` | Minimal focus trap for a portal-rendered panel: moves focus in on open, Tab/Shift+Tab cycle within the panel, Escape calls `onClose`, focus restores to the previously-focused element on close. Replaces `focus-trap-react` (not a dependency). Used by `Modal`, `Drawer`. |
| `usePlatformOwner` | `() => { isPlatformOwner, isKnown, isLoading }` | Reads `isPlatformOwner` from `GET /platform-settings` (shared `['platform-settings']` query). Drives the owner-only "Platform admin" nav entry and the Platform Settings page's "only the owner" screen. Also exports `platformSettingsQuery()` and `mergePlatformSettings(queryClient, patchResponse)` — use the latter after a PATCH so the flag isn't dropped from the cache. UI hint only; the server still 403s. |

---

## 5. Route guard — `client/src/routes/ProtectedRoute.jsx`

```jsx
<ProtectedRoute><AppShell /></ProtectedRoute>   // wrapper form
<Route element={<ProtectedRoute />}>...</Route>  // layout-route form, renders <Outlet/>
```

While `AuthContext`'s `loading` is `true`, renders a full-page `<Spinner size="xl"/>` (never
flashes the login page for an already-authenticated user refreshing). Once `loading` is `false`:
redirects to `/login` (via `<Navigate replace state={{from: location}}/>`, so `Login` can send the
user back to where they were) if `!isAuthenticated`; otherwise renders `children` or `<Outlet/>`.

---

## 6. UI primitives (`client/src/components/ui/*.jsx`)

All dark-mode aware via explicit `dark:` classes (matching the source design system's convention)
— they do not rely solely on `index.css`'s generic-class dark-mode fallback layer. All accept a
trailing `className` for one-off overrides (Rule 8 from the source design system's RULES.md).

### 6.1 `Button`

```jsx
<Button variant="primary" size="md" loading={saving} leftIcon={<Icon/>}>Save</Button>
<Button as={Link} to="/browse" variant="ghost" size="icon"><ChevronIcon/></Button>
```

| Prop | Values | Default |
|---|---|---|
| `variant` | `primary` (coral solid) \| `secondary` \| `dark` \| `outline` \| `ghost` \| `success` \| `warning` \| `danger` \| `link` \| `bare` (no colour classes — pass your own in `className`, e.g. the green WhatsApp button) | `primary` |
| `size` | `xs` \| `sm` \| `md` \| `lg` \| `compact` (responsive) \| `icon` | `md` |
| `rounded` | `sm`\|`md`\|`lg`\|`xl`\|`full`\|`none` | `lg` |
| `weight` | `normal`\|`medium`\|`semibold`\|`bold` | `medium` |
| `block` | boolean — full width | `false` |
| `loading` | boolean — disables + swaps children for a spinner | `false` |
| `leftIcon`/`rightIcon` | node | — |
| `as` | polymorphic element/component | `'button'` |

Ported from `apps/template/Button.jsx`; the `primary` variant uses our `primary-500`/`primary-600`
Tailwind tokens (coral) instead of the template's hardcoded blue, and the PTM-only `ai` (purple
gradient) variant was dropped.

### 6.2 `Badge`

`<Badge tone="green">Active</Badge>` — `tone`: `gray`(default)\|`blue`\|`green`\|`yellow`\|`red`\|`purple`.
Static-tone pill. Ported verbatim.

### 6.3 `Spinner`

`<Spinner size="xl" />` — `size`: `xs`\|`sm`\|`md`(default)\|`lg`\|`xl`\|`2xl`. `color`:
`primary`(default)\|`purple`\|`green`\|`red`\|`amber`\|`orange`\|`neutral`\|`gray`\|`white`\|`current`\|`bare`.
`variant`: `bar`(default, page/section loading) \| `ring` (small inline, e.g. inside a button).
Ported from the template with a `primary` color preset added (our brand token) as the default
instead of `blue`.

### 6.4 `Card` (+ `CardHeader`, `CardBody`, `CardFooter`)

```jsx
<Card hover onClick={openDoc}><CardBody>{doc.title}</CardBody></Card>
```
`rounded`: `none`\|`sm`\|`md`\|`lg`(default)\|`xl`\|`2xl`. `shadow`: `none`\|`sm`\|`card`(default)\|`soft`\|`lg`.
`bordered` (default `true`), `hover` (subtle lift, for clickable cards), `as` (polymorphic).
`CardBody`'s `padding`: `none`\|`sm`\|`md`(default)\|`lg`. Ported verbatim.

### 6.5 `Avatar` (+ `AvatarStack`)

`<Avatar user={membership} size="md" />` — `size`: `xs`\|`sm`\|`md`(default)\|`lg`\|`xl`. Renders
`user.avatar` (photo) if present, else initials on a colored circle using **`user.avatarColor`**
(our API's field, `docs/API.md` — a hex string from signup/member creation) instead of the
template's fixed gradient. `AvatarStack users={[...]} max={3}` for overlapping avatar groups
(e.g. "shared with 3 members").

### 6.6 `EmptyState`

```jsx
<EmptyState icon={<FolderIcon className="w-16 h-16"/>} title="No documents yet"
  description="Upload your first document." action={<Button onClick={openUpload}>Upload</Button>} />
```
`variant`: `card`(default, bordered)\|`inline`\|`plain`. `size`: `sm`\|`md`(default)\|`lg`. Pass
`children` instead of `title`/`description`/`action` for fully custom content.

**Illustrations** — pass `image` (a URL) instead of `icon` for a friendly picture above the title:

```jsx
<EmptyState image="/assets/empty-bin.png" title={t('emptyTitle')} description={t('emptyDescription')} />
```

Renders a decorative `<img alt="" loading="lazy" decoding="async">` with `width`/`height` set
(default `imageWidth={1536} imageHeight={1024}`, the size of every illustration in
`client/public/assets`) so nothing jumps while it loads; it's 180px wide on phones and 240px from
`sm` up. `image` wins if both `image` and `icon` are passed. Available illustrations (transparent
PNGs, served from `/assets/`): `empty-documents.png` (no documents — Browse, a person's list,
search with no results, empty vault), `empty-family-members.png` (only the owner in the family),
`empty-bin.png` (Bin page), `empty-404.png` (unknown URL, `pages/NotFound.jsx`), and
`welcome-onboarding.png` (first "create your family" screen, via `AuthLayout`'s `heroImage`).
Keep every empty-state text plain and action-oriented ("Tap “Add document” to save the first
one"), through `t()` with real Hindi alongside.

### 6.7 `Input`

`<Input label="Email" type="email" error={errors.email?.message} {...register('email')} />` —
forwards `ref` (works with `react-hook-form`'s `register` and imperative `.focus()`). Props:
`label?`, `error?`, `help?`, `leftIcon?`, `rightIcon?`, plus everything else spread onto the
`<input>`. Ported verbatim.

### 6.8 `SearchInput`

`<SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search..." />` — icon +
its own clear (×) button, forwards `ref`. `size`: `sm`(default)\|`md`. `ringColor`: `primary`(default)\|`neutral`.
The browser's built-in clear button on `type="search"` inputs is hidden globally in `index.css`, so
every search box shows exactly one ×.

### 6.9 `FileDropzone` (+ `UploadProgressItem`, `UploadProgressList`)

```jsx
<FileDropzone
  onFilesSelected={(accepted, rejected) => setQueue(accepted)}
  accept="application/pdf,image/*"
  maxSize={25 * 1024 * 1024}
  hint="PDF or image, up to 25MB"
/>
<UploadProgressList
  items={[{ id, name, progress, status: 'uploading' | 'done' | 'error', error? }]}
  onCancel={cancelUpload}
  onRetry={retryUpload}
/>
```
Drag-and-drop + click-to-browse, native HTML5 (no `react-dropzone` dependency — not in
`docs/DECISIONS.md`'s list). `accept` is a comma-separated string of extensions and/or
MIME types/wildcards (`.pdf,.jpg,image/*`), matching the native `accept` attribute's own syntax
(not react-dropzone's `{mime: []}` object shape). `onFilesSelected(accepted: File[], rejected:
{file, reasons}[])` — `reasons` contains `'file-invalid-type'`/`'file-too-large'`.
`UploadProgressList`/`UploadProgressItem` render a per-file progress bar (pair with
`documentsApi.create`'s `onUploadProgress` axios callback — see §2).

### 6.10 `Modal`

```jsx
<Modal isOpen={open} onClose={close} title="Add member"
  footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={save}>Save</Button></>}>
  <MemberForm />
</Modal>
```
**Mobile-adaptive**: below `lg` (1024px, via `useIsMobile`), renders as a **bottom sheet** (slides
up, rounded top corners, drag handle, safe-area bottom padding) instead of a centered dialog —
required by the build plan's "prefer bottom sheets over centered modals when narrow" instruction.
Pass `mobileVariant="center"` to opt a specific modal out (stays centered on all viewports — rare,
e.g. a small confirm dialog). `size`: `sm`\|`md`(default)\|`lg`\|`xl`\|`full` (ignored on the mobile
sheet, which is always full-width). `closeOnBackdrop`/`closeOnEscape` default `true`,
`hideCloseButton` default `false`. Focus-trapped via `useFocusTrap` (§4), body scroll locked while
open, portaled to `document.body`. Uses `h-[100dvh]`-based sizing throughout, never bare `bottom-0`
(mobile browser chrome safety, per the source design system's Rule 20).

### 6.11 `Drawer`

```jsx
<Drawer isOpen={open} onClose={close} side="right" title="Document detail">...</Drawer>
```
Side panel sliding in from an edge. `side`: `left`\|`right`(default)\|`top`\|`bottom`. `size`:
`sm`\|`md`(default)\|`lg`\|`xl`\|`full`. Same focus-trap/scroll-lock/portal behavior as `Modal`.
Every side uses `h-[100dvh]`/`top-0` (never `top-X` + bare `bottom-0`) so it always reaches the
true visible bottom on mobile regardless of URL-bar chrome. `hideBackdrop` for a persistent panel.
This is what `MobileDrawer` (the "More" menu, `side="left"`) is built on.

**Every popup is a right-side drawer.** Confirmations, menus of actions, and any form or detail
that used to be a centered modal or a native `window.confirm`/`alert`/`prompt` all render through
`Drawer`/`Modal`/`ConfirmDrawer`/`ConfirmModal` with `side="right"`: a title, a scrollable body,
and a footer pinned to the bottom with one primary button, full width on phone, with
`pb-[env(safe-area-inset-bottom)]` (or `var(--safe-bottom)`) on the footer. Never use
`window.confirm`/`window.alert`/`window.prompt`, and never hand-roll a centered `fixed inset-0`
panel — the one standing exception is a full-screen **image/PDF lightbox** (see
`features/documents/FilePreview.jsx`), which is a viewer, not a popup.

**Copy-in-input pattern.** Anywhere the user needs to copy a link (share link, invite link),
render a read-only `<input readOnly>` with a copy icon button inside its right end — never a
separate "Copy link" button. The button toggles the lucide `Copy` icon to `Check` for ~2s after a
successful copy, is `aria-label`d (`"Copy link"` / `"Link copied"`), and is at least 44×44px. See
`features/share/ShareDialog.jsx` or `features/members/InviteSharePanel.jsx` for the reference
implementation.

### 6.12 `Dropdown` (+ `DropdownItem`, `DropdownDivider`)

```jsx
<Dropdown trigger={<Avatar user={user}/>} align="right">
  <DropdownItem onSelect={openProfile}>Profile</DropdownItem>
  <DropdownDivider/>
  <DropdownItem danger onSelect={logout}>Sign out</DropdownItem>
</Dropdown>
```
Minimal trigger→menu wrapper; owns open state and closes on an outside click (via
`useClickOutside`), on Escape, and on any click inside the panel. To keep it open for an inline
control (e.g. the `ThemeSwitcher` row in the avatar menu), wrap that control in an element that
calls `e.stopPropagation()` on click. `align`: `left`(default)\|`right`. `unstyledPanel` drops the
default radius/border/shadow so the caller supplies its own panel skin.

### 6.13 `Tabs` (+ `TabsList`, `TabsTrigger`, `TabsContent`)

```jsx
<Tabs defaultValue="details">
  <TabsList><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList>
  <TabsContent value="details">...</TabsContent>
  <TabsContent value="activity">...</TabsContent>
</Tabs>
```
Controlled (`value`+`onValueChange`) or uncontrolled (`defaultValue`). Ported verbatim.

### 6.14 `Switch`

`<Switch label="A member is added" checked={on} onChange={(e) => setOn(e.target.checked)} />`
— iOS-style toggle (Settings > Notifications), real hidden checkbox (works with `react-hook-form`, keyboard accessible).
`size`: `sm`\|`md`(default). Ported verbatim (already used `primary-500`).

### 6.15 `ConfirmModal`

```jsx
<ConfirmModal isOpen={open} onClose={close} onConfirm={() => sharesApi.revoke(id)}
  title="Revoke this share link?" description="..." confirmLabel="Revoke" />
```
Yes/no dialog built on `Modal`. Awaits `onConfirm` (may be async), keeps the confirm button
`loading` until it resolves, closes on success. `confirmVariant` default `danger` (any `Button`
variant). `hideIcon` to drop the leading warning icon.

### 6.16 `FormField`

```jsx
<FormField label="Email" htmlFor="email" required error={errors.email?.message}>
  <Input id="email" type="email" {...register('email')} />
</FormField>
```
Label + required asterisk + hint/error wrapper for any control. (`Input`/`Textarea`/`SearchInput`
already have their own built-in label/error handling — `FormField` is for wrapping a control that
doesn't, e.g. a custom picker or a group of checkboxes.)

### 6.17 `Textarea`

`<Textarea label="Notes" rows={4} error={errors.notes?.message} {...register('notes')} />` — same
label/hint/error pattern as `Input`. Ported verbatim.

### 6.18 `Skeleton`

`<Skeleton height={20} width="70%" />` — pulse-animated content placeholder. `rounded`:
`sm`\|`md`(default)\|`lg`\|`full`. Compose several to mimic a shape (avatar + lines). Use `Spinner`
instead when a shape-matching placeholder doesn't make sense.

### 6.19 `PageHeader`

`<PageHeader title="Browse" subtitle="24 documents" actions={<Button>+ Upload</Button>} />` —
standard page-top heading: title/subtitle left, actions slot right, optional `breadcrumb`. Ported
verbatim.

### 6.20 `Table`

```jsx
<Table rows={members} rowKey={m => m.id} emptyMessage="No members yet"
  columns={[{key:'name', label:'Name', sortable:true}, {key:'role', label:'Role', render: m => <Badge>{m.role}</Badge>}]} />
```
Column: `{ key, label, align?, width?, sortable?, tooltip?, render?(row,i), cellClassName?,
headerClassName?, cellStyle? }`. Props: `rows`, `rowKey?`, `onRowClick?`, `rowClassName?`,
`sort?`/`onSortChange?`, `stickyHeader?`, `emptyMessage?`, `bordered?`(default `true`), `compact?`,
`overflowVisible?`, `minWidth?`, `expandedRows?`/`onToggleExpand?`/`renderExpanded?` (expandable
rows). **Simplified from the template**: the drag-drop reorder feature (`onDragEnd`,
`@hello-pangea/dnd`) and the dual-scrollbar helper were dropped — not in the dependency list and
this app has no Kanban-style reorder need. Header `tooltip` falls back to a plain `title` attribute
instead of the template's `InstantTooltip` component.

---

## 7. Layout (`client/src/components/layout/*`)

### 7.1 `AppShell` — `AppShell.jsx`

The signed-in app frame: `Navbar` (sticky top) + `Sidebar` (PC, `lg:` and up) + main content
(`<Outlet/>`) + `MobileTabBar` and `MobileDrawer` (below `lg`). A **layout route element** — it
renders `<Outlet/>` and takes no `children`.

### 7.2 `Navbar.jsx`

Sticky top bar, a 3-column grid on tablet/PC so the live search box (`features/search/
NavbarSearch.jsx`) sits truly centred. Left: logo + `FamilySwitcher`. Right: `LanguageSwitcher`
(segmented on PC, one compact button on phones) and the avatar `Dropdown`: name/email, a
`ThemeSwitcher` row (picking a mode keeps the menu open), Settings, Sign out. Phones have no search
box here — the bottom bar's Search tab opens `/search`. **Ctrl+K / Cmd+K** focuses the navbar
search from anywhere (or opens `/search` when the box is hidden); Enter goes to `/search?q=`.

### 7.3 `Sidebar.jsx`

PC-only (`hidden lg:flex`) collapsible nav rail from `visibleNavItems()` (§7.7). It is
`sticky top-16` with the remaining viewport height, so it stays fixed while the page scrolls.
Collapse toggle pinned at the bottom.

### 7.4 `MobileTabBar.jsx`

Fixed bottom bar below `lg`: **Home · Folders · + Add · Search · More**. "+ Add" opens the add
bottom sheet (`features/add/AddMenu.jsx` `AddMenuSheet`); "More" opens `MobileDrawer`. Safe-area
bottom padding, every tap target ≥44px.

### 7.5 `MobileDrawer.jsx`

The phone "More" menu (`Drawer`, `side="left"`): the current user, then **one row of two segmented
controls with no text labels — `ThemeSwitcher` (Sun / Moon) and `LanguageSwitcher` (English /
हिन्दी)**, the family row (opens `FamilySwitcherModal`), every nav link not in the bottom bar
(Shares, Members, Activity, Bin, Resize & compress, Settings, Platform admin for the owner) and
Sign out. Props: `isOpen`, `onClose`.

### 7.6 `ThemeSwitcher.jsx` and `LanguageSwitcher.jsx`

Two matching segmented pills (same height, radius and colours):

- `<ThemeSwitcher />` — Sun (light) and Moon (dark) icons; the active mode is highlighted and a tap
  sets that mode (`useTheme().setTheme`). Icons carry translated `aria-label` and `title`
  (`common:theme.light` / `common:theme.dark`).
- `<LanguageSwitcher variant="segmented" | "compact" | "row" />` — English / हिन्दी. `compact` is a
  single button naming the other language (phone navbar); `row` adds a "Language" label (Settings >
  Theme).

### 7.7 `navConfig.js`

Single source of truth for nav links: `NAV_ITEMS` = Home(`/`), Folders(`/browse`), Search(`/search`),
Shares(`/shares`), Members(`/members`), Activity(`/activity`), Bin(`/bin`), Resize &
compress(`/tools/resize`), Settings(`/settings`), Platform admin(`/platform-settings`,
`platformOwnerOnly`). `visibleNavItems({ isPlatformOwner })` drops owner-only entries;
`TAB_ITEMS` (`tab: true`) = Home, Folders, Search (the bar adds "+ Add" and "More");
`drawerNavItems()` = the rest.

### 7.8 Adding things — `features/add/`

`AddButton({ folderId? })` (PC popover / phone bottom sheet) and `AddMenuSheet` offer the four
options from `addOptions.js`: Upload document (`/add/document`), Take photo
(`/add/document?capture=1`), Save password (`/add/password`), Write note (`/add/note`), each
carrying `folderId` when given. Without a folder the add page says "Saving in: Shared".

### 7.9 Folder names

The Shared system folder is stored as "Shared". Always render folder names through
`folderName(folder, t)` and server `path` strings ("Shared › Papa") through
`folderPathLabel(path, t)` (`features/folders/folderTreeUtils.js`) so Hindi readers see "साझा".

### 7.10 Icons — `lucide-react`

`lucide-react` is the app's single icon source (replaced the old hand-rolled inline-SVG set).
Import icons directly where they're used and size them with Tailwind classes, same as before:

```jsx
import { Folder, Plus } from 'lucide-react';
<Folder className="w-5 h-5" />            // nav / section icons
<Plus className="w-4 h-4" strokeWidth={2} /> // inside buttons
```

Conventions: `w-4 h-4` inside buttons and rows, `w-5 h-5` for nav, `strokeWidth` left at lucide's
default (2) unless matching a lighter illustration-style glyph (1.5). Always pass `className` —
without it lucide renders at its 24px default. Decorative icons next to a text label need nothing
else; an icon-only button needs an `aria-label`.

The brand mark is the logo image `/assets/logo.png` (256×234, transparent) — used by the Navbar
(`h-9`, hidden below `sm`), `SidebarBrand` and `AuthLayout` (`h-14`), always `alt="Family Vault"`.

---

## 8. Auth pages (`client/src/pages/auth/*`)

### 8.1 `AuthLayout.jsx`

Shared shell for Login/Signup: centered card (`max-w-md`) on a soft background, brand logo image,
title/subtitle, optional `footer` slot (the "switch to the other auth page" link). Not a UI
primitive — single-use, page-specific. Props: `title`, `subtitle?`, `children`, `footer?`.

### 8.2 `Login.jsx` — public route, `/login`

Email/password form (react-hook-form + zod: both required, email format checked). On success,
redirects to `location.state.from.pathname` (set by `ProtectedRoute`) or `/`. On
`code: 'ACCOUNT_DISABLED'` shows a specific toast; otherwise a generic invalid-credentials toast.
Shows the Google button + One Tap when `VITE_GOOGLE_CLIENT_ID` is set (§8.4).

### 8.3 `Signup.jsx` — public route, `/signup`

`name`/`email`/`password`/`confirmPassword` (password ≥8 chars with a letter and a number, confirm
must match). A cold signup lands on `/onboarding` to name the family. `code: 'EMAIL_TAKEN'` gets a
specific toast. Shows the Google button when `VITE_GOOGLE_CLIENT_ID` is set.

### 8.4 Google sign-in

`GoogleSignInButton.jsx` renders the official Google Identity Services button (script loaded
lazily on the auth pages only; renders nothing when `env.googleClientId` is empty). A brand-new
Google identity (`POST /auth/google` → `needsSignup`) completes through
`completeGoogleSignup({ signupToken })` and then onboarding like any cold signup. Which sign-in
methods are allowed is a platform-wide setting (`/platform-settings`), not a per-member choice.

---

## 9. Conventions

- **`Avatar.avatarColor`** (§6.5) reads `user.avatarColor`; with neither `avatar` nor `avatarColor`
  it falls back to a neutral gradient.
- **`@config "../tailwind.config.js"`** in `client/src/index.css` is required — Tailwind v4's
  `@import` alone does not load a JS config, so the `primary`/`accent` colours and custom
  radii/shadows would otherwise emit no CSS.
- Every string goes through `t()` with real Hindi alongside (`client/src/i18n/locales/{en,hi}`);
  both locales always have the same keys.
- Controls are normal-sized on phones (≥44px tap targets), and no page may scroll sideways at 390px.

---

## 10. How to run / verify

```
cd client
npm install   # only if node_modules is missing
npm run dev   # VITE_API_URL points at the server (see .env.example)
npm test      # vitest
npm run build
```
