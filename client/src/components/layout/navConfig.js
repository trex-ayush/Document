import { Folder, History, House, ImageDown, Search, Settings, Share2, ShieldCheck, Trash2, Users } from 'lucide-react';

/**
 * Single source of truth for the app's navigation links, shared by the desktop Sidebar,
 * the phone bottom tab bar and the phone "More" drawer.
 *
 * `labelKey` is the `common:` translation key (`label` is the English fallback).
 * `tab: true` marks the links that sit in the phone bottom bar (Home, Folders, Search — the
 * bar adds "+ Add" in the centre and "More" itself); everything else lives in the drawer.
 */
const NAV_ITEMS = [
  { to: '/', label: 'Home', labelKey: 'nav.home', icon: House, tab: true, end: true },
  { to: '/browse', label: 'Folders', labelKey: 'nav.folders', icon: Folder, tab: true },
  { to: '/search', label: 'Search', labelKey: 'nav.search', icon: Search, tab: true },
  // Making and managing links needs write access (the /shares API refuses view-only members).
  { to: '/shares', label: 'Shares', labelKey: 'nav.shares', icon: Share2, writeOnly: true },
  { to: '/members', label: 'Members', labelKey: 'nav.members', icon: Users },
  { to: '/activity', label: 'Activity', labelKey: 'nav.activity', icon: History },
  { to: '/bin', label: 'Bin', labelKey: 'nav.bin', icon: Trash2 },
  { to: '/tools/resize', label: 'Resize & compress', labelKey: 'nav.resize', icon: ImageDown },
  { to: '/settings', label: 'Settings', labelKey: 'nav.settings', icon: Settings },
  // Deployment-wide admin panel — only listed for the super admin and admins
  // (hooks/usePlatformOwner.js `isPlatformAdmin`). Hiding it is a UI nicety; every /admin
  // endpoint still 403s for anyone else.
  { to: '/admin', label: 'Admin', labelKey: 'nav.admin', icon: ShieldCheck, platformAdminOnly: true },
];

/**
 * The nav list for the current person: drops admin-only entries unless they're a platform admin
 * (`isPlatformOwner` — the super admin — always counts as one), and write-only entries for a
 * view-only member.
 */
export function visibleNavItems({ isPlatformAdmin = false, isPlatformOwner = false, canWrite = true } = {}) {
  const canAdmin = isPlatformAdmin || isPlatformOwner;
  return NAV_ITEMS.filter((item) => (!item.platformAdminOnly || canAdmin) && (!item.writeOnly || canWrite));
}

/** Bottom-bar links, in order: Home, Folders, Search. */
export const TAB_ITEMS = NAV_ITEMS.filter((item) => item.tab);

/** What the phone "More" drawer lists: every visible link that isn't in the bottom bar. */
export function drawerNavItems({ isPlatformAdmin = false, isPlatformOwner = false, canWrite = true } = {}) {
  return visibleNavItems({ isPlatformAdmin, isPlatformOwner, canWrite }).filter((item) => !item.tab);
}
