import { Folder, History, House, ImageDown, Search, Settings, Share2, ShieldCheck, Trash2, Users } from 'lucide-react';

/**
 * Single source of truth for the app's navigation links, shared by the desktop Sidebar,
 * the phone bottom tab bar and the phone "More" drawer.
 *
 * `labelKey` is the `common:` translation key (`label` is the English fallback).
 * `tab: true` marks the links that sit in the phone bottom bar (Home, Folders, Search — the
 * bar adds "+ Add" in the centre and "More" itself); everything else lives in the drawer.
 */
export const NAV_ITEMS = [
  { to: '/', label: 'Home', labelKey: 'nav.home', icon: House, tab: true, end: true },
  { to: '/browse', label: 'Folders', labelKey: 'nav.folders', icon: Folder, tab: true },
  { to: '/search', label: 'Search', labelKey: 'nav.search', icon: Search, tab: true },
  { to: '/shares', label: 'Shares', labelKey: 'nav.shares', icon: Share2 },
  { to: '/members', label: 'Members', labelKey: 'nav.members', icon: Users },
  { to: '/activity', label: 'Activity', labelKey: 'nav.activity', icon: History },
  { to: '/bin', label: 'Bin', labelKey: 'nav.bin', icon: Trash2 },
  { to: '/tools/resize', label: 'Resize & compress', labelKey: 'nav.resize', icon: ImageDown },
  { to: '/settings', label: 'Settings', labelKey: 'nav.settings', icon: Settings },
  // Deployment-wide admin page — only listed for the platform owner (hooks/usePlatformOwner.js).
  // Hiding it is a UI nicety; the server still refuses owner-only writes for anyone else.
  { to: '/platform-settings', label: 'Platform admin', labelKey: 'nav.platformAdmin', icon: ShieldCheck, platformOwnerOnly: true },
];

/** The nav list for the current person: drops owner-only entries unless they're the platform owner. */
export function visibleNavItems({ isPlatformOwner = false } = {}) {
  return NAV_ITEMS.filter((item) => !item.platformOwnerOnly || isPlatformOwner);
}

/** Bottom-bar links, in order: Home, Folders, Search. */
export const TAB_ITEMS = NAV_ITEMS.filter((item) => item.tab);

/** What the phone "More" drawer lists: every visible link that isn't in the bottom bar. */
export function drawerNavItems({ isPlatformOwner = false } = {}) {
  return visibleNavItems({ isPlatformOwner }).filter((item) => !item.tab);
}
