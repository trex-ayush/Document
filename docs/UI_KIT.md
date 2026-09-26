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

## Design standard (read first)

One product, one look. The values live in code — `client/src/components/ui/tokens.js` and the
primitives below — so pages inherit them instead of re-typing classes. Controls are normal-sized
(44px tall on phones, 40px from `lg`), English and Hindi, light and dark.

**Page layout**
- Every signed-in page renders inside `PageContainer`: `max-w-5xl`, `px-4 sm:px-6`,
  `pt-4 sm:pt-6 pb-8` (AppShell adds room for the phone tab bar). Home, Folders, a form and
  Settings all share the same left and right edges; forms and cards fill that width.
- Signed-out screens: every auth screen (and Onboarding) uses `AuthLayout` — on PC a split screen
  (family photo panel left, the centred `max-w-md` card right), on phones a photo hero with the
  card overlapping it and the benefits below; the public share page uses a centred `max-w-2xl`
  column with the same gutters.
- `PageHeader` everywhere: optional breadcrumb above (`text-sm`, muted), optional back arrow,
  title `text-xl sm:text-2xl font-bold`, optional `titleAddon` (a "…" menu), subtitle `text-sm`
  muted, actions right-aligned from `sm` (below the title on phones). Gap below = section gap.

**Spacing scale** (Tailwind steps only)
- Between page sections and below the header: `4 / sm:6` (`SECTION_GAP`).
- Between cards/tiles in a grid: `gap-3 sm:gap-4` (`GRID_GAP`).
- Between form fields: `space-y-4` (`FIELD_GAP`); label → control `1.5`; hint/error `mt-1.5`.
- Card padding `p-4 sm:p-5` (`CARD_PADDING`); list rows use the same side padding.
- List row: 64px min height, `py-3`, 32×32 icon tile, `gap-3` between icon and text.

**Typography**: page title `text-xl sm:text-2xl font-bold` · section title `text-base
font-semibold` (`SECTION_TITLE`) · body `text-sm` · meta/caption `text-xs` · group label
`text-xs font-semibold uppercase tracking-wide` (`GROUP_LABEL`). Title/body/muted colours:
`neutral-900/100`, `neutral-700/300`, `neutral-500/400` (light/dark).

**Buttons** — only `Button` (never a hand-rolled `<button>` styled as one):
- `primary` = the single main action of a view; `secondary` = other actions and Cancel;
  `ghost` = low-emphasis; `danger` = the confirming step of a destructive action;
  `danger-ghost` = a button that starts one (Delete in a page header); `link` = inline text.
- One size (`md`); `sm` only in dense rows and toolbars; `size="icon"` for icon-only controls
  (44/40px square). Radius `rounded-lg`, icon `h-4 w-4`, icon gap `gap-2` — fixed.
- Order: Cancel then the primary action on the right, in page forms and drawer footers. Drawer
  footers share the row equally (`Drawer` lays them out); a single action fills the row.
- The WhatsApp button is the one brand exception (`variant="bare"` + WhatsApp green).

**Colour**
- Greys are the warm `neutral-*` scale only (50…950, defined in `tailwind.config.js`); never
  `gray-*`. `primary-*` (coral) for main actions, active states (sidebar, More menu, bottom
  tab bar, a selected choice) and links. Segmented controls (language, theme,
  grid/list) use one neutral track with a raised active segment (`SEGMENT_TRACK`).
- Tabs (`Tabs`, §6.13) are an underline row: full-width hairline, each tab an optional 16px
  outline icon (stroke 1.75) + `text-sm` label; inactive `neutral-600`, active near-black
  `font-medium` with a 2px dark underline on the hairline; scrolls sideways on phones with edge
  fades and no scrollbar.
- Red / amber / green only mean danger / warning / success (`Notice`, `Badge`, errors).
- Kinds have one tint everywhere (`KIND_TONE`): folder = primary, document = neutral,
  password = sky, note = violet.
- Icon tiles in cards and rows (Home count tiles, folder cards, `ListIcon`) copy the starter's
  MetricCard tile: `ICON_TILE` = 32×32 `rounded-lg`, icon `ICON_TILE_ICON` = 16px at lucide's
  2px stroke; tint = the kind's -100 tile with a -700 icon in light, -900/30 (primary /40) with a
  -300 icon in dark (neutral 100/600 → 700/300).
- Surfaces: card `bg-white / dark:bg-neutral-800`, border `neutral-200 / neutral-700`,
  row hover `neutral-50 / neutral-700/50`, page `neutral-50 / neutral-950`. Fields are
  `bg-white / dark:bg-neutral-900`. No `!important` colour overrides: base CSS sits in
  `@layer base` so utilities always win.

**Cards and lists**
- `Card` = `rounded-xl`, neutral border, `shadow-card`; `SectionCard` adds a titled header.
- Numbers (Home counts, admin stats) use `StatCard` (§6.26): `rounded-2xl`, big bold value, muted
  label, a short dotted rule, a sub-line (tone-coloured part + muted part) and a tinted diamond
  with the icon cut by the right edge. Tones: blue, sky, orange, green, violet, primary, neutral.
- One row style, `ListRow` inside a `ListCard`: icon, title, muted meta, optional snippet,
  trailing actions. Used by Browse, Search (page and navbar dropdown), Shares, Members, Bin,
  Activity and the + Add menu. The folder picker's tree rows match its height, icon gap and colours.
- States: skeletons shaped like the content while loading (`Skeleton.jsx`: rows, cards, form
  fields, a page, the whole app frame on refresh) — spinners only inside small inline actions;
  `ErrorState` / `InlineError` (red text); `EmptyState` (illustration or 48px icon,
  section-title heading, muted text, actions secondary-then-primary); `Notice` (info / warning /
  success banner).
- Choosing: 2–6 options are tappable choice cards (`ChoiceGroup`); longer lists use the app's
  own dropdown (`SelectMenu`) — never the browser's native select. Passwords
  use `PasswordInput` (eye button inside the field).

**Overlays**: every popup is a right-side `Drawer` (header with the shared close button, body
`px-4 sm:px-5`, footer as above); confirmations are `ConfirmDrawer`. Dropdown menus
(`Dropdown`) have 44/40px items with `px-4`.

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
<Button loading={saving} leftIcon={<Plus className="h-4 w-4" />}>Add</Button>
<Button as={Link} to="/browse" variant="secondary">Open folders</Button>
<Button variant="ghost" size="icon" aria-label="Close"><X className="h-5 w-5" /></Button>
```

| Prop | Values | Default |
|---|---|---|
| `variant` | `primary` \| `secondary` \| `ghost` \| `danger` \| `danger-ghost` \| `link` \| `bare` (brand buttons only — the WhatsApp button). Old names `outline`/`dark`/`success`/`warning` render as `secondary`. | `primary` |
| `size` | `md` (44px phones / 40px from `lg`) \| `sm` (dense rows, toolbars) \| `icon` (square icon-only). `lg`/`xs`/`compact` map to `md`/`sm`. | `md` |
| `block` | boolean — full width | `false` |
| `loading` | boolean — disables + spinner | `false` |
| `leftIcon`/`rightIcon` | node (`h-4 w-4`) | — |
| `as` | polymorphic element/component | `'button'` |

`className` is for layout only (width, margins). `ICON_BUTTON_CLASS` (exported) gives the same
look to an icon-only trigger that can't be a `<button>` (a `Dropdown` trigger span).

### 6.2 `Badge`

`<Badge tone="green">Active</Badge>` — `tone`: `gray`(default)\|`blue`\|`green`\|`yellow`\|`red`\|`purple`.
Static-tone pill with explicit dark tones. green/yellow/red only for success/warning/danger.

### 6.3 `Spinner`

`<Spinner size="xl" />` — `size`: `xs`\|`sm`\|`md`(default)\|`lg`\|`xl`\|`2xl`. `color`:
`primary`(default)\|`purple`\|`green`\|`red`\|`amber`\|`orange`\|`neutral`\|`gray`\|`white`\|`current`\|`bare`.
`variant`: `bar`(default, page/section loading) \| `ring` (small inline, e.g. inside a button).
Ported from the template with a `primary` color preset added (our brand token) as the default
instead of `blue`.

### 6.4 `Card` (+ `CardHeader`, `CardBody`, `SectionCard`)

```jsx
<Card><CardBody>{doc.notes}</CardBody></Card>
<SectionCard id="settings-profile" title="Profile" bodyClassName="space-y-4">…</SectionCard>
```
Defaults are the one card look: `rounded-xl`, neutral border, `shadow-card`; `CardBody` padding
`p-4 sm:p-5` (`padding="none"` to drop it). `SectionCard` = a card with a titled header (section
title + optional description) for settings-style sections.

### 6.5 `Avatar`

`<Avatar user={membership} size="md" />` — `size`: `xs`\|`sm`\|`md`(default)\|`lg`\|`xl`. Renders
`user.avatar` (photo) if present, else initials on a colored circle using **`user.avatarColor`**
(our API's field, `docs/API.md` — a hex string from signup/member creation) instead of the
template's fixed gradient.

### 6.6 `EmptyState`

```jsx
<EmptyState icon={<FolderIcon className="w-16 h-16"/>} title="No documents yet"
  description="Upload your first document." action={<Button onClick={openUpload}>Upload</Button>} />
```
`variant`: `card`(default, the standard card surface)\|`inline`\|`plain`. The title is a section title, any `icon` is
drawn at 48px, and `action` may be several buttons (secondary first, primary last). `size`: `sm`\|`md`(default)\|`lg`. Pass
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
`empty-bin.png` (Bin page) and `empty-404.png` (unknown URL, `pages/NotFound.jsx`). Onboarding
uses `AuthLayout`'s photo hero.
Keep every empty-state text plain and action-oriented ("Tap “Add document” to save the first
one"), through `t()` with real Hindi alongside.

### 6.7 `Input`

`<Input label="Email" type="email" error={errors.email?.message} {...register('email')} />` —
forwards `ref` (works with `react-hook-form`'s `register` and imperative `.focus()`). Props:
`label?`, `error?`, `help?`, `leftIcon?`, `rightIcon?`, plus everything else spread onto the
`<input>`. There is no native `<select>` in the app — pick-one lists use `SelectMenu` (§6.25).
Input, SelectMenu, Textarea and SearchInput (`size="md"`) share the
`FIELD_*` tokens: same height as a Button, `rounded-lg`, neutral border, soft focus ring.

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

### 6.10 `Modal` — removed

Every popup is a right-side `Drawer` (§6.11); the old `Modal` wrapper had no callers left and was
deleted, and so was its `ConfirmModal` alias: use `ConfirmDrawer` (§6.15).

### 6.11 `Drawer`

```jsx
<Drawer isOpen={open} onClose={close} side="right" title="Document detail">...</Drawer>
```
Side panel sliding in from an edge. `side`: `left`\|`right`(default)\|`top`\|`bottom`. `size`:
`sm`\|`md`(default)\|`lg`\|`xl`\|`full`\|`nav` (85% wide, max 20rem — the phone More menu).
Body padding `px-4 sm:px-5`; the close button is the shared icon button. `footer` takes the
Buttons as siblings — Cancel first, the primary action last; they share the row equally and the
safe-area padding is added by Drawer. Same focus-trap/scroll-lock/portal behavior as `Modal`.
Every side uses `h-[100dvh]`/`top-0` (never `top-X` + bare `bottom-0`) so it always reaches the
true visible bottom on mobile regardless of URL-bar chrome. `hideBackdrop` for a persistent panel.
This is what `MobileDrawer` (the "More" menu, `side="left"`) is built on.

**Every popup is a right-side drawer.** Confirmations, menus of actions, and any form or detail
that used to be a centered modal or a native `window.confirm`/`alert`/`prompt` all render through
`Drawer`/`ConfirmDrawer` with `side="right"`: a title, a scrollable body, and a footer pinned to
the bottom (Cancel | primary, or one full-width button; Drawer adds the safe-area padding). Never use
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
Controlled (`value`+`onValueChange`) or uncontrolled (`defaultValue`). `TabsTrigger` takes an
optional `icon` (lucide component). Underline style (see the Design standard); `TabsList` fills
the row, scrolls sideways with soft edge fades, and scrolls the active tab into view. Used by
Settings (My account / Family), Shares (Active / All) and the admin tabs. `TabLinks` (same file)
is the same row for tabs that are routes: `items [{ to, label, icon?, end? }]`, `aria-label` —
used by the admin panel's section tabs.

### 6.14 `Switch`

`<Switch label="A member is added" checked={on} onChange={(e) => setOn(e.target.checked)} />`
— iOS-style toggle (Settings > Family > Notifications), real hidden checkbox (works with `react-hook-form`, keyboard accessible).
`size`: `sm`\|`md`(default). Ported verbatim (already used `primary-500`).

### 6.15 `ConfirmDrawer`

```jsx
<ConfirmDrawer isOpen={open} onClose={close} onConfirm={() => sharesApi.revoke(id)}
  title="Turn off this link?" description="..." confirmLabel="Revoke" />
```
The one yes/no confirmation. Awaits `onConfirm` (may be async), keeps the confirm button
`loading` until it resolves, closes on success. Footer: Cancel (secondary) | confirm
(`confirmVariant`, default `danger`). `hideIcon` drops the warning icon.

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

### 6.19 `PageHeader` and `PageContainer`

```jsx
<PageContainer>
  <PageHeader title="Bin" subtitle="Things you delete wait here." actions={<Button>…</Button>} />
  …
</PageContainer>
<PageHeader title="Upload document" onBack={goBack} subtitle={<SaveInRow />} />
<PageHeader breadcrumb={<FolderBreadcrumb path={path} />} title="Papa" titleAddon={<FolderActionsMenu … />} />
```
`PageContainer` is the outer box of every signed-in page (width and padding, see the Design
standard). `PageHeader`: `breadcrumb?`, `onBack?` (back arrow), `title`, `titleAddon?`,
`subtitle?`, `actions?`. Loading and error states render inside `PageContainer` too.

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

Kept for the admin pages; the family app's lists use `ListRow` (§6.21) instead.

### 6.21 `ListRow` (+ `ListCard`, `ListIcon`)

```jsx
<ListCard>
  <ListRow to={`/documents/${d.id}`} icon={<ListIcon icon={FileText} kind="document" />}
    title={d.title} meta="26 Sept 2026 · 2 files" actions={<Button size="sm" variant="secondary">…</Button>} />
</ListCard>
```
The one list row. `ListRow` props: `icon`, `title`, `meta?`, `snippet?`, `actions?`, `to?` \|
`onClick?`, `mainProps?` (role/id/aria for the main element), `active?`, `compact?` (popover
rows), `wrapTitle?`, `as?` (`li` inside `<ListCard as="ul">`). `ListCard` = bordered card with
hairline dividers (`overflowVisible` when rows have a dropdown menu). `ListIcon` = 32×32 kind
tint (`kind`: folder/document/password/note/member) or a thumbnail (`src`).

### 6.22 `PageState` — `LoadingState`, `ErrorState`, `InlineError`, `Notice`

`<LoadingState />` skeleton rows (`compact`: skeleton lines inside a card) · `<ErrorState>`
centred red text when a section fails to load · `<InlineError>` red text under a form ·
`<Notice tone>` soft banner, `info` \| `warning` \| `success`.

### 6.24 Skeletons — `Skeleton.jsx`

`<Skeleton />` block · `variant="line"` · `variant="circle" size={40}`; pulse only when motion is
allowed, neutral-200 / neutral-700. Composed, sized like the real thing: `SkeletonHeader`,
`SkeletonRows` (`count`, `action`, `avatar` — same height as `ListRow`), `SkeletonCards`
(`className` grid columns, `tileHeight`), `SkeletonFields` (label + field pairs, Save),
`PageSkeleton` (header + rows at the page width) and `AppShellSkeleton` (navbar, sidebar / tab
bar, page — shown by `ProtectedRoute` while the session is checked on refresh).

### 6.25 `ChoiceGroup`, `SelectMenu`, `PasswordInput`

- `ChoiceGroup` — `options [{ value, label, hint? }]`, `value`, `onChange(value)`, `label?`,
  `hint?`, `columns?` (1 \| 2 \| 3). A styled radio group of choice cards (access level, share
  duration, active/disabled).
- `SelectMenu` — `options [{ value, label }]`, `value`, `onChange(value)`, `label?`, `id?`,
  `aria-label?`. The field box opens a `Dropdown` list with a tick on the chosen option
  (Activity filters, Resize unit/format, the admin toolbars). The native `Select` was removed.
- `PasswordInput` — every `Input` prop; an eye button inside the right end shows/hides the
  text ("Show password" / "Hide password"). Works `readOnly` (the saved password page).
  `Input` itself has a `trailing` slot for such an in-field button.

### 6.26 `StatCard`

`value`, `label`, `icon` (lucide component), `tone` (`blue` \| `sky` \| `orange` \| `green` \|
`violet` \| `primary` \| `neutral`), `sub` (`{ strong?, muted? }` or a node), `loading`
(same-size placeholders), `to` (Link) or `onClick` (button), `className` (grid placement).
Card: white / `neutral-800`, `rounded-2xl`, neutral border, `shadow-soft-xs`, `px-4 py-3.5 sm:p-5
lg:p-6`. Phones: a compact card — value and label on one line, 72px diamond, text column stops
64px from the right. From `sm`: value above label, 128px diamond, text stops 96px from the right.
The sub-line is always one line (cut with "…").
Diamond: a rounded square turned 45° centred on the right edge,
a `-200 → transparent` gradient in the tone (dark: `-500/35`), icon 20px / 26px at stroke 1.75
in the tone's -600 (dark -400). Home: 1 per row on phones, 2 per row on tablets and small PCs
(last one full width), 3 + 2 from `xl`.

### 6.23 `tokens.js`

Class strings for the standard: `PAGE_WIDTH`, `PAGE_PADDING`, `SECTION_GAP`, `GRID_GAP`,
`FIELD_GAP`, `CARD_PADDING`, `CARD_SURFACE`, `SECTION_TITLE`, `GROUP_LABEL`, `TEXT_*`,
`FIELD_*`, `SEGMENT_TRACK` + `segmentItem(active)`, `choiceItem(active)`, `NAV_ACTIVE`/`NAV_IDLE`,
`KIND_TONE`, `ICON_TILE`/`ICON_TILE_ICON`, `TEXT_LINK`, `ROW_HOVER`/`ROW_ACTIVE`.

**Admin panel** (`pages/admin/*`) follows the same standard: `PageContainer` + `PageHeader`
("Admin" + role badge + subtitle), `TabLinks` for the sections, `StatCard`s for numbers
(Overview, System), `ListCard`/`ListRow` on phones and `Table` on PC for lists, a toolbar of
`SearchInput` + `SelectMenu`, titled `Section` cards (same look as `SectionCard`) with Save rows
at the bottom right (secondary action, then primary), `ChoiceGroup` for 2–3 options, skeleton
rows while loading (`LoadingBlock`), `EmptyState` and `ErrorBlock`.

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

The phone "More" menu (`Drawer`, `side="left"`, 85% wide / max 20rem): the current user, then **one row of two segmented
controls with no text labels — `ThemeSwitcher` (Sun / Moon) and `LanguageSwitcher` (English /
हिन्दी)**, the family row (opens `FamilySwitcherModal`), every nav link not in the bottom bar
(Shares, Members, Activity, Bin, Resize & compress, Settings, Platform admin for the owner) and
Sign out. Props: `isOpen`, `onClose`.

### 7.6 `ThemeSwitcher.jsx` and `LanguageSwitcher.jsx`

Two matching segmented pills (same height, radius and colours):

- `<ThemeSwitcher />` — Sun (light) and Moon (dark) icons; the active mode is highlighted and a tap
  sets that mode (`useTheme().setTheme`). Icons carry translated `aria-label` and `title`
  (`common:theme.light` / `common:theme.dark`).
- `<LanguageSwitcher variant="segmented" | "compact" />` — English / हिन्दी. `compact` is a
  single button naming the other language (phone navbar).

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

### 7.8b Members — `features/members/`

`MemberPanel` (tap a member row, admins): header with avatar, email and badges; Details (name,
access as choice cards, status) saved with the footer; Invite for a pending member ("Share link"
and "Send email again" — both make a fresh link and email it, because invite links are stored
hashed and can't be shown again); Account (Reset password, Remove from family). A pending row
also has a "Resend" button. `AddMemberDrawer` adds a member (name + email) and shows the invite
step (`InviteSharePanel`).

### 7.8c Choosing the folder on the add forms — `features/folders/FolderField.jsx`

"Save in folder": the first field of Upload document / Save password / Write note — a box the
size of an Input with the folder path and "Change ›"; the whole box opens `FolderPicker`.

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
(`h-9`, hidden below `sm`) and `SidebarBrand`, always `alt="Family Vault"`; `AuthLayout` shows it
in a 40px white tile next to the name "Family Vault".

---

## 8. Auth pages (`client/src/pages/auth/*`)

### 8.1 `AuthLayout.jsx`

Shared shell for every signed-out screen (and Onboarding). Not a UI primitive — page-specific.

- **PC (`lg`+)**: split screen. Left half: a full-height photo (`photo="family"` or
  `"paperwork"`) with a soft coral tint and dark fades, the logo, a tagline and three benefit
  points. Right half: the title/subtitle, the standard card (`max-w-md`, card surface + padding)
  and the `footer` link, centred.
- **Phones/tablets**: a photo hero across the top (`42svh`, 208–416px) with the logo top-left
  and the language switch top-right over a soft dark fade, masked into the page at the bottom.
  The card (`rounded-2xl`, `shadow-soft-md`) overlaps the hero by 64px and holds the title and
  subtitle. Right below the footer link (24px gap): the three benefits (32px coral icon tiles)
  and an "Encrypted and private to your family" line, so a short (Google-only) form isn't lonely.
  Google-only pages add a one-line hint above the Google button.
- The language switch is always top-right.
- Photos: `client/public/assets/auth/` (credits and sizes in `CREDITS.md`), AVIF with a WebP
  fallback: 4:5 crops at 1200/1920/2880 wide for the PC panel (`sizes="50vw"`), 6:5 crops at
  800/1200 wide for the phone hero (`sizes="100vw"`). Each `<picture>` has sources only for its
  own screen size, so phones never fetch the PC files. Loaded eagerly with `fetchpriority="high"`
  over a tiny blurred copy.
- Loading: `loading` swaps the title for skeleton lines; the card body uses `SignInSkeleton`
  (Onboarding while the session loads, Login/Signup while a Google sign-up finishes) — no spinner.
- Text links use the exported `AUTH_LINK` classes (coral, underline on hover, focus ring). Form
  errors (wrong password, email taken, rate limit…) show in a red `Notice tone="error"` at the top
  of the card, not a toast.
- Props: `title`, `subtitle?`, `children`, `footer?`, `photo?` (`'family'` | `'paperwork'`,
  default `'paperwork'`), `loading?`.

### 8.2 `Login.jsx` — public route, `/login`

Email/password form (react-hook-form + zod: both required, email format checked). On success,
redirects to `location.state.from.pathname` (set by `ProtectedRoute`) or `/`. On
`code: 'ACCOUNT_DISABLED'` shows a specific message, a 429 says "too many requests"; otherwise a
generic invalid-credentials message (all in the card's error banner).
Shows the Google button + One Tap when `VITE_GOOGLE_CLIENT_ID` is set (§8.4).

### 8.3 `Signup.jsx` — public route, `/signup`

`name`/`email`/`password`/`confirmPassword` (password ≥8 chars with a letter and a number, confirm
must match). A cold signup lands on `/onboarding` to name the family. `code: 'EMAIL_TAKEN'` gets a
specific message in the card's error banner. Shows the Google button when `VITE_GOOGLE_CLIENT_ID`
is set.

### 8.4 Google sign-in

`GoogleSignInButton.jsx` renders Google's own Identity Services button (script loaded lazily on
the auth pages only; renders nothing when `env.googleClientId` is empty or the script can't load).
It stays Google's button on purpose: the server needs the ID token GIS returns from its own
button, and Google's button already follows Google's branding rules. It is fitted in: `outline`
theme in light and `filled_black` in dark, the app language as its `locale`, `large` (40px),
full row width up to Google's 400px maximum, and a same-size look-alike placeholder (inline
multicolour "G") while the script loads. `AuthDivider` is the "OR USE YOUR EMAIL" rule below it. A brand-new
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
