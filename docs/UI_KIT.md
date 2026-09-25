# UI Kit — client frontend foundation (Agent D)

Everything under `client/src/components/**`, `client/src/context/**`, `client/src/services/**`
(except `itemsApi.js`), `client/src/hooks/**`, `client/src/pages/auth/**`, and
`client/src/routes/ProtectedRoute.jsx`. Read this instead of the source — it's written to be
complete enough that Agents E/F and the Items agent never need to open these files directly.

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
const { isDark, toggleTheme } = useTheme();
```

Wrap once in `main.jsx` (already done): `<ThemeProvider>`.

### `AuthContext` — `client/src/context/AuthContext.jsx`

`{ user, membership, family, isAuthenticated, loading, login, signup, loginWithGoogle,
completeGoogleSignup, logout, logoutAll, updateUser }`.

- `user`/`membership`/`family` are the three separate entities `GET /auth/me` and every
  login/signup response carry (docs/API.md) — not one flattened object.
- `loading` is `true` only during the initial mount-time token validation (`GET /auth/me`) —
  `ProtectedRoute` shows a spinner instead of bouncing to `/login` while this is true, so a page
  refresh never flashes the login screen for an already-authenticated user.
- `login({email,password})`, `signup({familyName,name,email,password})` — apply and persist the
  returned session (`accessToken`/`refreshToken` to `localStorage`, `user`/`membership`/`family`
  to state + `localStorage`).
- `loginWithGoogle(credential)` — POSTs the GIS ID token to `/auth/google`. Either applies a
  session (existing linked identity) and returns it, or returns
  `{ needsSignup: true, signupToken, profile }` unchanged for the caller to hand to
  `completeGoogleSignup`. See section 8.
- `completeGoogleSignup({ signupToken, familyName })` — POSTs to `/auth/google/complete`, applies
  the returned session.
- `logout()` — revokes the current refresh token server-side (best-effort) and clears local state.
  `logoutAll()` — revokes every refresh token for the user (`POST /auth/logout-all`).
- `updateUser(user)` — local-only patch (e.g. after `PATCH /auth/me` in Settings), no network call.

```jsx
import { useAuth } from '@/context/AuthContext.jsx';
const { user, isAuthenticated, logout } = useAuth();
```

Wrap once in `main.jsx` (already done, inside `ThemeProvider`): `<AuthProvider>`.

---

## 2. Services (`client/src/services/*.js`)

One function per `docs/API.md` endpoint (except `/items/*` — Items agent's `itemsApi.js`). Every
function is `apiClient.<verb>(url, ...).then(res => res.data)` — thin, no business logic. Full
endpoint-by-endpoint mapping is in each file's top comment; only non-obvious behavior is called
out here.

| File | Covers | Notes |
|---|---|---|
| `config/env.js` | `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID` | `apiBaseUrl` already includes `/api` (see `.env.example`) — never prefix service calls with `/api`. `googleClientId` is `''` when unset. |
| `services/storage.js` | `localStorage` wrapper + `STORAGE_KEYS` | `get/set/remove` (JSON) and `getRaw/setRaw` (raw strings, for tokens). Never throws — returns `null`/no-ops on failure (private mode, quota). |
| `services/apiClient.js` | axios instance | Bearer attach + refresh-on-401 with a single-flight queue (see §3). |
| `services/authApi.js` | `/auth/*` | See §1 above + §8 (Google). |
| `services/membersApi.js` | `/members` | `create` takes either the login-enabled or profile-only shape (docs/API.md). |
| `services/familyApi.js` | `/family` | |
| `services/documentTypesApi.js` | `/document-types` | |
| `services/foldersApi.js` | `/folders`, `/browse` | `browse(folderId)` — omit `folderId` for root. `remove(id, {confirm})` — first call without `confirm` to get the `{requiresConfirm, folderCount, documentCount, fileCount}` warning shape, call again with `confirm: true`. |
| `services/documentsApi.js` | `/documents/*` | Multipart endpoints (`create`, `addFiles`, `replaceFile`) take an optional `{ onUploadProgress }` — an axios progress-event callback — pair with `<UploadProgressList>` (§6.9) for a per-file progress bar. `revealField(id, fieldId, reauthToken)` sends `reauthToken` as the `X-Reauth` header. |
| `services/filesApi.js` | `/files/:signedToken` (URL helpers only) | The endpoint streams raw bytes, never called via axios. `resolveUrl` prefixes a relative signed URL with the API base; `getForceDownloadUrl` appends `?download=1`; `triggerDownload(url, filename)` fires a browser download via a throwaway `<a download>`. |
| `services/sharesApi.js` | `/shares/*` | `create()`'s response is the **only** time the raw share `url` is ever returned — show/copy it immediately, it's not recoverable from `list`/`get` later. |
| `services/publicApi.js` | `/public/*` | Uses a **bare axios instance**, not `apiClient` — no bearer token, and a 401 here means "wrong share password", not "expired session" (must never trigger the refresh interceptor). `password` is sent as the `X-Share-Password` header. |
| `services/activityApi.js` | `/activity` | Cursor pagination (`cursor`/`nextCursor`), not page/limit. |
| `services/statsApi.js` | `/stats` | |

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
refresh call itself fails), clears the stored session and dispatches a `window` `auth:logout`
event — `AuthContext` listens for it and clears `user`/`membership`/`family`, which combined with
`ProtectedRoute` bounces the user to `/login`.

```jsx
import { apiClient } from '@/services/apiClient.js';
// Prefer the typed *Api.js wrappers above over calling apiClient directly.
```

---

## 4. Hooks (`client/src/hooks/*.js`)

| Hook | Signature | Use |
|---|---|---|
| `useClickOutside` | `(ref, handler, enabled = true)` | Closes a popover/dropdown/menu on outside pointerdown/touchstart. Used by `Dropdown`, `Fab`. |
| `useIsMobile` | `(breakpoint = 1024) => boolean` | True below the given breakpoint (default matches Tailwind's `lg`). Used by `Modal` (bottom-sheet switch) and `Fab` (popover vs. bottom-sheet menu). |
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
| `variant` | `primary` (coral solid) \| `secondary` \| `dark` \| `outline` \| `ghost` \| `success` \| `warning` \| `danger` \| `link` \| `bare` | `primary` |
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
Static-tone pill. For a dynamic/colored status (e.g. a Share's status), use `StatusPill` instead.
Ported verbatim.

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
clear (×) button, forwards `ref`. `size`: `sm`(default)\|`md`. `ringColor`: `primary`(default)\|`neutral`.
Ported from the template with a `primary` ring preset replacing `blue` as default.

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
`documentsApi.create`'s `onUploadProgress` axios callback — see §2) — **this is the piece Agent E's
Browse upload flow wires up**: drive `items` state from the axios progress event, set
`status: 'done'` on success / `'error'` + `error` message on failure.

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
This is what `MobileDrawer` (nav menu, `side="left"`) and `Fab`'s mobile action sheet
(`side="bottom"`) are built on.

### 6.12 `Dropdown` (+ `DropdownItem`, `DropdownDivider`)

```jsx
<Dropdown trigger={<Avatar user={user}/>} align="right">
  <DropdownItem onSelect={openProfile}>Profile</DropdownItem>
  <DropdownDivider/>
  <DropdownItem danger onSelect={logout}>Sign out</DropdownItem>
</Dropdown>
```
Minimal trigger→menu wrapper; owns open state + outside-click close (via `useClickOutside`).
`align`: `left`(default)\|`right`. `unstyledPanel` drops the default radius/border/shadow so the
caller supplies its own panel skin.

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

`<Switch label="Require re-auth for secrets" description="..." {...register('requireReauthForSecrets')} />`
— iOS-style toggle, real hidden checkbox (works with `react-hook-form`, keyboard accessible).
`size`: `sm`\|`md`(default). Ported verbatim (already used `primary-500`).

### 6.15 `ConfirmModal`

```jsx
<ConfirmModal isOpen={open} onClose={close} onConfirm={() => sharesApi.update(id,{revoke:true})}
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

### 6.21 `ViewModeToggle`

`<ViewModeToggle value={viewMode} onChange={setViewMode} />` — segmented control, default options
**`grid`/`list`** (changed from the template's `kanban`/`table` — this app has no Kanban view; pass
`options={[{value,label}, ...]}` to override). Unlike the template (`hidden lg:flex`), visible at
every breakpoint — Browse's grid/list toggle is useful on mobile too.

### 6.22 `TagChip`

`<TagChip tag={{ name: 'tax-2025' }} onClick={() => setTagFilter('tax-2025')} />` — colored chip
using `tag.color` (hex, optional — falls back to neutral gray) for border/bg/text. `variant`:
`outline`(default)\|`solid`. Note: `Document.tags` (`docs/API.md`) is currently a plain string
array, not `{name,color}` objects — wrap as `{ name: tagString }` until/unless that changes.

### 6.23 `StatusPill` (+ `SHARE_STATUS`)

```jsx
<StatusPill status={{ color: '#22C55E', name: 'Done' }} />
<StatusPill shareStatus="revoked" size="sm" />
```
Colored pill: leading dot + translucent background in `status.color`. Generalized from the
template (which only took a raw `{color,name}` from project config) with a `shareStatus` prop +
exported `SHARE_STATUS` map (`active`/`expired`/`revoked` → color+label) for this app's main
dynamic-status use — a Share's status (`docs/API.md GET /shares`). Pass either `status` (raw) or
`shareStatus` (convenience).

---

## 7. Layout (`client/src/components/layout/*`)

### 7.1 `AppShell` — `AppShell.jsx`

The authenticated app frame: `Navbar` (sticky top) + `Sidebar` (desktop `lg:`+) + main content
(`<Outlet/>`) + `MobileTabBar` (below `lg`) + `MobileDrawer` + `Fab`. **This is a layout route
element** — it renders `<Outlet/>` itself, it does not take a `children` prop. The lead wires it
into `AppRouter.jsx` as a parent route's `element`; see this agent's final report for the exact
route tree.

**The folder-tree slot** (for Agent E's Browse feature): `AppShell` owns no folder data, only the
*slot* `Sidebar` renders it in. Any nested route pushes JSX into it via the exported
`useAppShell()` hook:

```jsx
import { useEffect } from 'react';
import { useAppShell } from '@/components/layout/AppShell.jsx';

function BrowsePage() {
  const { setSidebarSlot } = useAppShell();
  useEffect(() => {
    setSidebarSlot(<FolderTree folders={folders} activeId={folderId} onSelect={openFolder} />);
    return () => setSidebarSlot(null); // clear on unmount so other pages don't inherit it
  }, [folders, folderId]);
  return ...;
}
```

The slot renders below the main nav links in the **desktop Sidebar only** — hidden while the
sidebar is collapsed, and not shown in the mobile drawer (mobile Browse should render its folder
tree inline in the page; there's no room for it in the tab-bar-driven mobile layout).

### 7.2 `Navbar.jsx`

Sticky top bar: mobile hamburger (`lg:hidden`, calls `onOpenDrawer` prop) → brand (shows
`family?.name` from `AuthContext`, falls back to "Family Vault") → a search trigger (button,
navigates to `/search` — desktop shows it inline as a fake search box, mobile shows an icon) →
theme toggle → user `Dropdown` (name/email, Settings link, Sign out). Props: `onOpenDrawer`.

### 7.3 `Sidebar.jsx` (+ `SidebarBrand`)

Desktop/tablet-only (`hidden lg:flex`) collapsible nav rail, from `NAV_ITEMS` (§7.7). Props:
`isCollapsed`, `onToggleCollapse`, `sidebarSlot` (see §7.1). Collapse toggle pinned at the bottom.

### 7.4 `MobileTabBar.jsx`

Fixed bottom tab bar, `lg:hidden`: Home, Browse, Search, Shares, **More** (opens the same
`MobileDrawer` as the navbar hamburger — `onOpenMore` prop). `pb-[var(--safe-bottom)]` for the
home-indicator safe area, every tap target ≥44px tall. This — plus `MobileDrawer` — is the mobile
nav `apps/template`'s `Sidebar` never had (`docs/DECISIONS.md` "Mobile nav gap": it was `hidden
lg:flex` with zero mobile fallback).

### 7.5 `MobileDrawer.jsx`

Full nav menu (every `NAV_ITEMS` entry, not just the tab bar's 4) + current user + theme toggle +
sign out, built on `Drawer` (`side="left"`). Props: `isOpen`, `onClose`.

### 7.6 `Fab.jsx`

Floating "+" button (build-plan requirement). Desktop: upward popover menu anchored above the
button. Mobile (`useIsMobile`): a `Drawer` (`side="bottom"`) bottom sheet with full-height rows.
Six actions:

- **Upload file** / **Take photo** / **New folder** — *no owning page exists yet* (Browse is a
  later phase). Navigate to `/browse` with a query-param convention:
  `?upload=1`, `?upload=1&capture=1`, `?newFolder=1`. **Whoever builds Browse should read these on
  mount and open the matching flow** — this is an assumption Agent D made in the absence of a
  contract; flag to the lead if Browse already has a different mechanism.
- **Add password/login** / **Add number/record** / **Add secure note** — navigate exactly to
  `/items/new?kind=login` / `?kind=record` / `?kind=note` (the Items module's routes, per the
  build plan — `client/src/pages/items/ItemsRoutes.jsx`).

No props.

### 7.7 `navConfig.js`

Single source of truth for nav links, shared by `Sidebar`/`MobileTabBar`/`MobileDrawer`:
`NAV_ITEMS` (`{ to, label, icon, tab?, end? }[]`) = Home(`/`), Browse(`/browse`), Search(`/search`),
Shares(`/shares`), Members(`/members`), Activity(`/activity`), Bin(`/bin`), Settings(`/settings`), plus
Platform admin(`/platform-settings`, `platformOwnerOnly: true`) — Sidebar/MobileDrawer render
`visibleNavItems({ isPlatformOwner })`, which drops owner-only entries for everyone else. `TAB_ITEMS`
(`tab: true` subset) = the first 4; `MORE_ITEMS` = the rest. **None of these routes/pages are
Agent D's to build** — this is the path list Agent D's final report asks the lead to wire.

### 7.8 Icons — `lucide-react`

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

`components/layout/icons.jsx` survives only as a two-export shim (`UsersIcon`, `MoreIcon`, both
lucide underneath) for `pages/Members.jsx`; delete it once that page imports from `lucide-react`.

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

`familyName`/`name`/`email`/`password`/`confirmPassword` (react-hook-form + zod: password ≥8 chars
with a letter and a number, confirm must match). Calls `authApi.signup` via `AuthContext.signup`,
redirects to `/` on success. `code: 'EMAIL_TAKEN'` gets a specific toast. Shows the Google button
(no One Tap) when `VITE_GOOGLE_CLIENT_ID` is set.

### 8.4 Google sign-in

Added mid-build against a spec for a parallel "Agent G" server module (`POST /auth/google`,
`/auth/google/complete`, `/link`, `/unlink`, `/auth/set-password` — not yet in `docs/API.md` as of
this writing; will land there once Agent G reports back, shapes below are final per that spec).

- **`GoogleSignInButton.jsx`** — renders the official Google Identity Services (GIS) button.
  Lazily loads `https://accounts.google.com/gsi/client` on mount (only on Login/Signup, never
  globally) — once, shared across both pages via a module-level promise. **Renders nothing** when
  `env.googleClientId` is empty (checked by the pages too, so the "or" divider also doesn't show
  with no button above it). Button width tracks its container via `ResizeObserver` (GIS only
  accepts a pixel width, clamped 200-400px per Google's supported range) so it looks right from
  360px up. Props: `onCredential(credential)`, `enableOneTap?` (Login only, per spec), `text?`
  (GIS button text variant, default `'continue_with'`). Also exports `AuthDivider` (the "or" line).
- **`GoogleSignupStep.jsx`** — the inline "name your family's vault" step shown when
  `POST /auth/google` responds `{ needsSignup: true, signupToken, profile: {name,email,avatarUrl} }`
  (brand-new Google identity, no existing account). Prefills the family name as
  `"<Surname> Family"` parsed from `profile.name`. `onSubmit(familyName)` should call
  `completeGoogleSignup({ signupToken, familyName })`. Shared by both Login and Signup (either
  page's Google button can trigger it — there's no separate "Google signup" button).
- **`authApi.js`** gained `googleLogin`, `googleComplete`, `googleLink`, `googleUnlink`,
  `setPassword` (§2). Only the first two are called by Login/Signup; the last three exist for
  **Phase 2 to use later** — see below.
- **`AuthContext`** gained `loginWithGoogle`/`completeGoogleSignup` (§1).

**Out of scope for Agent D, left for Phase 2 (Agent F) — the API functions already exist, just no
UI yet**:
1. Settings → Account: connect/disconnect Google (`authApi.googleLink`/`googleUnlink`).
2. The re-auth modal's "Continue with Google" option (when `Family.settings.requireReauthForSecrets`
   is on — `docs/API.md POST /auth/reauth`).
3. The Members admin sign-in-method picker (choosing password vs. Google for a new member) and
   `authApi.setPassword` (a Google-only account adding a password).

---

## 9. Conventions / assumptions to flag if wrong

- **FAB's Browse query params** (`?upload=1`, `?upload=1&capture=1`, `?newFolder=1`) — invented in
  the absence of a Browse-page contract (§7.6). If Browse ends up with a different open-a-flow
  mechanism, update `client/src/components/layout/navConfig.js`'s `FAB_ACTIONS_KEY` comment and
  `Fab.jsx`'s `ACTIONS` array.
- **`Document.tags` as plain strings** (§6.22) — `TagChip` expects `{name,color}`; wrap tag
  strings as `{ name: tagString }` until/unless the API grows per-tag colors.
- **`Avatar.avatarColor`** (§6.5) reads `user.avatarColor` per `docs/API.md`'s signup/member
  response shape — if a member has neither `avatar` nor `avatarColor`, it falls back to the
  template's neutral gradient.
- **`@config "../tailwind.config.js"`** was added to `client/src/index.css` (right after
  `@import "tailwindcss"`) — Tailwind v4's `@import` alone does **not** load a JS config file, so
  `tailwind.config.js`'s `primary`/`accent` color extensions (and custom radii/shadows/animations)
  were silently emitting no CSS at all until this was added (found live: the Login page's "Sign
  in" button rendered with a transparent background and invisible white-on-white text). If you add
  more `theme.extend` values to `tailwind.config.js`, they'll now be picked up automatically.
- Two small keyframe animations (`slideInLeft`, `slideInDown`) were added to `index.css` for
  `Drawer`'s `side="left"`/`side="top"` — the source design system only had right/up variants.

---

## 10. How to run / verify

```
cd client
npm install   # only if node_modules is missing
npm run dev
```

Boots with providers wired in `main.jsx`: `QueryClientProvider` → `ThemeProvider` → `AuthProvider`
→ `<AppRouter/>` + `<Toaster/>`. Until the lead wires the real route tree into `AppRouter.jsx`
(see this agent's final report), the dev server only shows the placeholder page — Login/Signup/
AppShell were verified during this build via a temporary preview harness (deleted before commit,
not part of the app) rendering them directly in a `MemoryRouter`. Verified: boots with no console
errors (aside from a harmless missing-favicon 404 on the temporary harness itself), dark mode
toggles correctly (`family-vault-theme` key, `dark` class on `<html>`), zod validation fires
correctly on both forms, and Login renders correctly at both 360px and 1440px widths (screenshots
taken via Playwright MCP during the build, not committed).
