import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { visibleNavItems } from './navConfig.js';
import { usePlatformOwner } from '@/hooks/usePlatformOwner.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NAV_ACTIVE, NAV_IDLE } from '@/components/ui/tokens.js';
import { useCanWrite } from '@/hooks/useCanWrite.js';
import Tooltip from '@/components/ui/Tooltip.jsx';


/**
 * Sidebar — desktop (`lg:` and up) collapsible nav rail. Stays put while the page
 * scrolls (sticky under the navbar, full remaining viewport height) and scrolls on its
 * own when its links are taller than the screen. Hidden below
 * `lg` (the mobile bottom tab bar + drawer take over — see MobileTabBar.jsx
 * / MobileDrawer.jsx, the gap apps/template's own Sidebar left unfilled).
 *
 * Props: isCollapsed, onToggleCollapse
 */
export default function Sidebar({ isCollapsed, onToggleCollapse }) {
  const { t } = useTranslation('common');
  const { isPlatformAdmin } = usePlatformOwner();
  const canWrite = useCanWrite();
  const navItems = visibleNavItems({ isPlatformAdmin, canWrite });
  return (
    <aside
      className={`hidden lg:flex flex-col flex-shrink-0 sticky top-16 self-start h-[calc(100dvh-4rem)] bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 transition-all duration-200 ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      <nav className="flex-1 min-h-0 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            const label = t(item.labelKey, item.label);
            const tip = t(item.tipKey, item.tip);
            return (
              <li key={item.to}>
                {/* Collapsed: the name (it is hidden) and what it is. Open: just what it is. */}
                <Tooltip
                  content={
                    isCollapsed ? (
                      <>
                        <span className="block font-semibold">{label}</span>
                        {tip}
                      </>
                    ) : (
                      tip
                    )
                  }
                  position="right"
                  className="grid"
                >
                <NavLink
                  to={item.to}
                  end={item.end}
                  aria-label={isCollapsed ? label : undefined}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-lg pl-2 pr-3 text-sm transition-colors ${isActive ? NAV_ACTIVE : NAV_IDLE}`
                  }
                >
                  <span className="w-8 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-5 h-5" />
                  </span>
                  {!isCollapsed && <span className="ml-2 font-medium whitespace-nowrap">{label}</span>}
                </NavLink>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-3 border-t border-neutral-200 dark:border-neutral-700">
        <Tooltip
          content={isCollapsed ? t('tip.showMenu', 'Show the full menu') : t('tip.hideMenu', 'Make the menu small')}
          position="right"
          className="grid"
        >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? t('nav.expandSidebar', 'Expand sidebar') : t('nav.collapseSidebar', 'Collapse sidebar')}
          className={`flex w-full min-h-11 items-center rounded-lg pl-2 pr-3 transition-colors ${NAV_IDLE}`}
        >
          <span className="w-8 flex items-center justify-center flex-shrink-0">
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </span>
          {!isCollapsed && <span className="ml-2 text-sm font-medium">{t('nav.collapse', 'Collapse')}</span>}
        </button>
        </Tooltip>
      </div>
    </aside>
  );
}
