import { Folder, History, House, Search, Settings, Share2, Trash2, Users } from 'lucide-react';

/**
 * Single source of truth for AppShell's navigation links, shared by the
 * desktop Sidebar, the mobile bottom tab bar, and the mobile slide-in
 * drawer. Routes are NOT owned by Agent D (AppRouter.jsx is lead-owned,
 * these pages land in later phases) — this is the path list Agent D's
 * final report asks the lead to wire up.
 *
 * `tab: true` marks the 4 items (plus the synthetic "More" entry added by
 * MobileTabBar itself) that appear in the mobile bottom tab bar; the full
 * list always appears in the desktop Sidebar and the mobile drawer.
 */
// `labelKey` is the common:nav.* translation key each render site (Sidebar/
// MobileTabBar/MobileDrawer) looks up via `t(item.labelKey, item.label)` —
// `label` stays as the English fallback so this file never needs to import
// i18next itself.
export const NAV_ITEMS = [
  { to: '/', label: 'Home', labelKey: 'nav.home', icon: House, tab: true, end: true },
  { to: '/browse', label: 'Browse', labelKey: 'nav.browse', icon: Folder, tab: true },
  { to: '/search', label: 'Search', labelKey: 'nav.search', icon: Search, tab: true },
  { to: '/shares', label: 'Shares', labelKey: 'nav.shares', icon: Share2, tab: true },
  { to: '/members', label: 'Members', labelKey: 'nav.members', icon: Users },
  { to: '/activity', label: 'Activity', labelKey: 'nav.activity', icon: History },
  { to: '/bin', label: 'Bin', labelKey: 'nav.bin', icon: Trash2 },
  { to: '/settings', label: 'Settings', labelKey: 'nav.settings', icon: Settings },
];

/** Items shown in the mobile tab bar (first 4), everything else lives behind "More". */
export const TAB_ITEMS = NAV_ITEMS.filter((item) => item.tab);
export const MORE_ITEMS = NAV_ITEMS.filter((item) => !item.tab);

/**
 * FAB quick-action menu. The three "Add ..." items are the Items module's
 * routes (docs/API.md "Items", client/src/pages/items/ItemsRoutes.jsx —
 * owned by a separate agent) and are wired exactly as the build plan
 * specifies. "Upload file" / "Take photo" / "New folder" have no
 * owner/contract yet (Browse is a later-phase page) — they navigate to
 * `/browse` with a query-param convention (`?upload=1`, `?upload=1&capture=1`,
 * `?newFolder=1`) documented in docs/UI_KIT.md and this agent's final report
 * for whoever builds Browse to read on mount and open the matching flow.
 */
export const FAB_ACTIONS_KEY = {
  UPLOAD_FILE: 'upload-file',
  TAKE_PHOTO: 'take-photo',
  NEW_FOLDER: 'new-folder',
  ADD_LOGIN: 'add-login',
  ADD_RECORD: 'add-record',
  ADD_NOTE: 'add-note',
};
