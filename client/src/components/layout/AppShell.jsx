import { createContext, useContext, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import Sidebar from './Sidebar.jsx';
import MobileTabBar from './MobileTabBar.jsx';
import MobileDrawer from './MobileDrawer.jsx';
import Fab from './Fab.jsx';
import CommandPalette from '../../features/search/CommandPalette.jsx';

/**
 * AppShell — the authenticated app frame. Renders:
 *  - Navbar (logo, search trigger, theme toggle, user menu) — sticky top
 *  - Sidebar — desktop/tablet (`lg:` and up) collapsible nav rail with a
 *    folder-tree slot (see `useAppShell()` below)
 *  - MobileTabBar — bottom tab bar below `lg` (Home, Browse, Search, Shares, More)
 *  - MobileDrawer — full nav slide-in menu, opened by the navbar hamburger
 *    or the tab bar's "More" button
 *  - Fab — floating "+" quick-action button/menu
 *  - `<Outlet/>` — the matched child route's page
 *
 * This is a **layout route element**: the lead wires it into AppRouter.jsx
 * as the element of a parent route whose children are the authenticated
 * pages (wrapped in `<ProtectedRoute>` — see routes/ProtectedRoute.jsx and
 * this agent's final report for the exact route tree). AppShell itself
 * renders `<Outlet/>`, it does not take a `children` prop.
 *
 * ---
 * ### The folder-tree slot (for Agent E's Browse feature)
 *
 * AppShell owns no folder data — it only owns the *slot* Sidebar renders
 * it in. Any nested page can push arbitrary JSX into that slot via the
 * `useAppShell()` hook:
 *
 * ```jsx
 * import { useEffect } from 'react';
 * import { useAppShell } from '@/components/layout/AppShell.jsx';
 *
 * function BrowsePage() {
 *   const { setSidebarSlot } = useAppShell();
 *   useEffect(() => {
 *     setSidebarSlot(<FolderTree folders={folders} activeId={folderId} onSelect={openFolder} />);
 *     return () => setSidebarSlot(null); // clear on unmount so other pages don't inherit it
 *   }, [folders, folderId]);
 *   return ...;
 * }
 * ```
 *
 * The slot renders below the main nav links in the desktop Sidebar only
 * (hidden while the sidebar is collapsed, and not shown in the mobile
 * drawer — mobile Browse should render its folder tree inline in the page
 * instead, there's no room for it in the tab-bar-driven mobile layout).
 */
const AppShellContext = createContext(null);

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used within AppShell (i.e. inside a protected route)');
  return ctx;
}

export default function AppShell() {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [sidebarSlot, setSidebarSlot] = useState(null);

  const openDrawer = () => setDrawerOpen(true);
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <AppShellContext.Provider value={{ setSidebarSlot, sidebarSlot }}>
      <div className="min-h-[100dvh] flex flex-col bg-neutral-50 dark:bg-neutral-950">
        <Navbar onOpenDrawer={openDrawer} />

        <div className="flex flex-1 min-h-0">
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            sidebarSlot={sidebarSlot}
          />

          <main className="flex-1 min-w-0 pb-20 lg:pb-0">
            <Outlet />
          </main>
        </div>

        <MobileTabBar onOpenMore={openDrawer} />
        <MobileDrawer isOpen={isDrawerOpen} onClose={closeDrawer} />
        <Fab />
        {/* Global Ctrl+K / Cmd+K search — rendered here (inside the router tree, under AppShell's
            own route) rather than in main.jsx, since it navigates via useNavigate(). */}
        <CommandPalette />
      </div>
    </AppShellContext.Provider>
  );
}
