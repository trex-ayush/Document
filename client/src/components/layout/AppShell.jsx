import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import Sidebar from './Sidebar.jsx';
import MobileTabBar from './MobileTabBar.jsx';
import MobileDrawer from './MobileDrawer.jsx';
import { useVisualViewport } from '@/hooks/useVisualViewport.js';

/**
 * AppShell — the authenticated app frame. Renders:
 *  - Navbar (family switcher, centred live search, language, user menu) — sticky top
 *  - Sidebar — desktop (`lg:` and up) collapsible nav rail, sticky while the page scrolls
 *  - MobileTabBar — bottom bar below `lg` (Home, Folders, + Add, Search, More)
 *  - MobileDrawer — the "More" menu (everything not in the bottom bar)
 *  - `<Outlet/>` — the matched child route's page
 *
 * This is a **layout route element** (routes/AppRouter.jsx): the element of the
 * parent route whose children are the signed-in pages, wrapped in
 * `<ProtectedRoute>`. It renders `<Outlet/>`, it does not take a `children` prop.
 */
export default function AppShell() {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  // Tracks the on-screen keyboard so Save rows stay above it and the tab bar hides.
  useVisualViewport();

  const openDrawer = () => setDrawerOpen(true);
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <Navbar />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        <main className="flex-1 min-w-0 pb-20 lg:pb-0">
          <Outlet />
        </main>
      </div>

      <MobileTabBar onOpenMore={openDrawer} />
      <MobileDrawer isOpen={isDrawerOpen} onClose={closeDrawer} />
    </div>
  );
}
