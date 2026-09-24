import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV_ITEMS } from './navConfig.js';
import { ChevronLeftIcon, ChevronRightIcon, LogoMark } from './icons.jsx';

/**
 * Sidebar — desktop/tablet (`lg:` and up) collapsible nav rail. Hidden below
 * `lg` (the mobile bottom tab bar + drawer take over — see MobileTabBar.jsx
 * / MobileDrawer.jsx, the gap apps/template's own Sidebar left unfilled).
 *
 * Carries the **folder-tree slot**: `sidebarSlot` is arbitrary JSX fed by
 * `useAppShell().setSidebarSlot(...)` from whatever page wants sidebar
 * real estate (Agent E's Browse feature feeds a folder tree here — see
 * AppShell.jsx's doc comment for the exact hook usage). Renders nothing
 * extra when no page has set a slot.
 *
 * Props: isCollapsed, onToggleCollapse, sidebarSlot?
 */
export default function Sidebar({ isCollapsed, onToggleCollapse, sidebarSlot }) {
  const { t } = useTranslation('common');
  return (
    <aside
      className={`hidden lg:flex flex-col flex-shrink-0 bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 transition-all duration-200 ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      <nav className="flex-1 min-h-0 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
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

        {sidebarSlot && !isCollapsed && (
          <div className="mt-4 px-3">
            <div className="border-t border-neutral-100 dark:border-neutral-700 pt-4">{sidebarSlot}</div>
          </div>
        )}
      </nav>

      <div className="p-3 border-t border-neutral-100 dark:border-neutral-700">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? t('nav.expandSidebar', 'Expand sidebar') : t('nav.collapseSidebar', 'Collapse sidebar')}
          className="w-full flex items-center pl-2 pr-3 py-2.5 min-h-[44px] text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-xl transition-colors"
        >
          <span className="w-8 flex items-center justify-center flex-shrink-0">
            {isCollapsed ? <ChevronRightIcon className="w-5 h-5" /> : <ChevronLeftIcon className="w-5 h-5" />}
          </span>
          {!isCollapsed && <span className="ml-2.5 text-sm font-medium">{t('nav.collapse', 'Collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}

export function SidebarBrand({ collapsed }) {
  const { t } = useTranslation('common');
  return (
    <div className="flex items-center gap-2.5 px-3 py-3">
      <div className="w-8 h-8 bg-neutral-900 dark:bg-neutral-700 rounded-lg flex items-center justify-center flex-shrink-0">
        <LogoMark className="w-4 h-4 text-white" />
      </div>
      {!collapsed && <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('appName', 'Family Vault')}</span>}
    </div>
  );
}
