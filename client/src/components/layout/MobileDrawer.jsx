import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Drawer from '@/components/ui/Drawer.jsx';
import Avatar from '@/components/ui/Avatar.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { drawerNavItems } from './navConfig.js';
import { usePlatformOwner } from '@/hooks/usePlatformOwner.js';
import { FamilySwitcherModal } from './FamilySwitcher.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import ThemeSwitcher from './ThemeSwitcher.jsx';
import Button from '@/components/ui/Button.jsx';
import { ChevronRight, LogOut, X } from 'lucide-react';

// Nav item colours — keep in step with NAV_ACTIVE / NAV_IDLE in components/ui/tokens.js.
const NAV_ACTIVE = 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300';
const NAV_IDLE =
  'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700/50 dark:hover:text-neutral-100';

/**
 * MobileDrawer — the phone/tablet "More" menu, opened by the bottom tab bar's "More" button.
 *
 * Top to bottom, with no separate title row:
 *  - the signed-in user (avatar, name, email) with the close button on the same row;
 *  - the family row (opens `FamilySwitcherModal` — rendered as a sibling of `<Drawer>` so it stays
 *    mounted after this drawer closes);
 *  - the nav links not already in the tab bar (Shares, Members, Activity, Bin, Resize & compress,
 *    Settings…);
 *  - pinned at the bottom: `ThemeSwitcher` and `LanguageSwitcher` as two equal-width tabs, then
 *    Sign out, sitting right on the safe-area edge.
 *
 * The panel is narrower than the screen so the dimmed page stays visible — tapping it closes too.
 *
 * Props: isOpen, onClose
 */
export default function MobileDrawer({ isOpen, onClose }) {
  const { t } = useTranslation('common');
  const { user, family, logout } = useAuth();
  const navigate = useNavigate();
  const [isSwitcherOpen, setSwitcherOpen] = useState(false);
  const { isPlatformOwner } = usePlatformOwner();
  const navItems = drawerNavItems({ isPlatformOwner });

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/login', { replace: true });
  };

  const openSwitcher = () => {
    onClose();
    setSwitcherOpen(true);
  };

  const rowClass = 'flex w-full min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors';

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        side="left"
        size="sm"
        title={t('nav.menu', 'Menu')}
        hideHeader
        bodyClassName="flex flex-col"
        className="!w-[85%] !max-w-xs"
      >
        <div className="flex items-center gap-3 border-b border-neutral-200 pb-3 pl-4 pr-2 pt-[calc(var(--safe-top)+0.75rem)] dark:border-neutral-700">
          {user && <Avatar user={user} size="md" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{user?.name}</p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('actions.close', 'Close')}>
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {family && (
          <button
            type="button"
            onClick={openSwitcher}
            title={family.name}
            className="flex w-full min-w-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2.5 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-700/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {t('nav.family', 'Family')}
              </span>
              <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{family.name}</span>
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-neutral-400" aria-hidden="true" />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) => `${rowClass} ${isActive ? NAV_ACTIVE : NAV_IDLE}`}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  {t(item.labelKey, item.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-2 border-t border-neutral-200 px-2 pt-3 pb-[calc(var(--safe-bottom)+0.5rem)] dark:border-neutral-700">
          <div className="grid grid-cols-2 gap-2 px-2">
            <ThemeSwitcher block />
            <LanguageSwitcher variant="segmented" block />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className={`${rowClass} ${NAV_IDLE}`}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            {t('actions.signOut', 'Sign out')}
          </button>
        </div>
      </Drawer>
      <FamilySwitcherModal isOpen={isSwitcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
}
