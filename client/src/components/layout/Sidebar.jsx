import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { visibleNavItems } from './navConfig.js';
import { usePlatformOwner } from '@/hooks/usePlatformOwner.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
                    `flex items-center pl-2 pr-3 py-2.5 rounded-xl text-sm transition-colors min-h-[44px] ${
                      isActive
                        ? 'bg-neutral-900 dark:bg-neutral-700 text-white'
                        : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 hover:text-neutral-900 dark:hover:text-white'
                    }`
                  }
                >
                  <span className="w-8 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-5 h-5" />
                  </span>
                  {!isCollapsed && <span className="ml-2.5 font-medium whitespace-nowrap">{label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-3 border-t border-neutral-100 dark:border-neutral-700">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? t('nav.expandSidebar', 'Expand sidebar') : t('nav.collapseSidebar', 'Collapse sidebar')}
          className="w-full flex items-center pl-2 pr-3 py-2.5 min-h-[44px] text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-xl transition-colors"
        >
          <span className="w-8 flex items-center justify-center flex-shrink-0">
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </span>
          {!isCollapsed && <span className="ml-2.5 text-sm font-medium">{t('nav.collapse', 'Collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}
