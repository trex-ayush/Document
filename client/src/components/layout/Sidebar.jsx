import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { visibleNavItems } from './navConfig.js';
import { usePlatformOwner } from '@/hooks/usePlatformOwner.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Nav item colours — keep in step with NAV_ACTIVE / NAV_IDLE in components/ui/tokens.js.
const NAV_ACTIVE = 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300';
const NAV_IDLE =
  'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700/50 dark:hover:text-neutral-100';

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
  const { isPlatformOwner } = usePlatformOwner();
  const navItems = visibleNavItems({ isPlatformOwner });
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
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  title={isCollapsed ? label : undefined}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-lg pl-2 pr-3 text-sm transition-colors ${isActive ? NAV_ACTIVE : NAV_IDLE}`
                  }
                >
                  <span className="w-8 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-5 h-5" />
                  </span>
                  {!isCollapsed && <span className="ml-2 font-medium whitespace-nowrap">{label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-3 border-t border-neutral-200 dark:border-neutral-700">
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
      </div>
    </aside>
  );
}
