import { NavLink } from 'react-router-dom';
import { TAB_ITEMS } from './navConfig.js';
import { MoreIcon } from './icons.jsx';

/**
 * MobileTabBar — fixed bottom tab bar shown below `lg`: Home, Browse,
 * Search, Shares, More. This (plus MobileDrawer) is the mobile nav
 * apps/template never had (its Sidebar was `hidden lg:flex` with no mobile
 * fallback — docs/DECISIONS.md "Mobile nav gap").
 *
 * "More" opens the same slide-in drawer as the navbar hamburger (full nav +
 * theme + sign out) — `onOpenMore` is normally AppShell's `openDrawer`.
 *
 * Anchored with `fixed bottom-0` (not a computed-height overlay, so Rule
 * 20's `h-[100dvh]` guidance doesn't apply here — a bottom bar's own height
 * is intrinsic) plus `pb-[var(--safe-bottom)]` for the home-indicator safe
 * area, and every tap target is >=44px tall.
 *
 * Props: onOpenMore
 */
export default function MobileTabBar({ onOpenMore }) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 pb-[var(--safe-bottom)]"
      aria-label="Primary"
    >
      <div className="grid grid-cols-5">
        {TAB_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] font-medium ${
                isActive ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-500 dark:text-neutral-400'
              }`
            }
          >
            <item.icon className="w-5 h-5" strokeWidth={1.75} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onOpenMore}
          className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] font-medium text-neutral-500 dark:text-neutral-400"
        >
          <MoreIcon className="w-5 h-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
