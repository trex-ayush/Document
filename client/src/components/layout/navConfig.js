import {
  ActivityIcon,
  FolderIcon,
  HomeIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  UsersIcon,
} from './icons.jsx';

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
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: HomeIcon, tab: true, end: true },
  { to: '/browse', label: 'Browse', icon: FolderIcon, tab: true },
  { to: '/search', label: 'Search', icon: SearchIcon, tab: true },
  { to: '/shares', label: 'Shares', icon: ShareIcon, tab: true },
  { to: '/members', label: 'Members', icon: UsersIcon },
  { to: '/activity', label: 'Activity', icon: ActivityIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
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
