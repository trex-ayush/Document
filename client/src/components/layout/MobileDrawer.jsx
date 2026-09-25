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
import { ChevronRight, LogOut } from 'lucide-react';

/**
 * MobileDrawer — the phone/tablet "More" menu, opened by the bottom tab bar's
 * "More" button. Lists every visible nav link that isn't already in the tab
 * bar (Shares, Members, Activity, Bin, Resize & compress, Settings…), the current user with
 * one row of two segmented controls under it — `ThemeSwitcher` (Sun / Moon) and
 * `LanguageSwitcher` (English / हिन्दी), no text labels, visible as soon as the drawer opens so
 * a family member who only reads Hindi can reach it immediately — a family row (multi-family
 * accounts — opens `FamilySwitcherModal`, since nesting a `Dropdown` inside this already-
 * scrollable `Drawer` risks the panel getting clipped; see `FamilySwitcher.jsx`'s doc
 * comment), and sign out. Built on the `Drawer` primitive (`side="left"`), which already
 * follows Rule 20 (`h-[100dvh]`, not `top-X bottom-0`).
 *
 * `FamilySwitcherModal` is rendered as a sibling of `<Drawer>` (not nested
 * inside it) so it stays mounted — and can open — even after the family row
 * closes this drawer first (same pattern `handleLogout` below already uses).
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

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} side="left" size="sm" title={t('nav.menu', 'Menu')} hideBackdrop={false}>
      <div className="flex flex-col h-full -mx-5 -my-4">
        {user && (
          <div className="border-b border-neutral-100 dark:border-neutral-700">
            <div className="flex items-center gap-3 px-5 py-4">
              <Avatar user={user} size="lg" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">{user.name}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-neutral-100 dark:border-neutral-700">
          <ThemeSwitcher />
          <LanguageSwitcher variant="segmented" />
        </div>

        {family && (
          <button
            type="button"
            onClick={openSwitcher}
            title={family.name}
            className="w-full min-w-0 min-h-[44px] flex items-center justify-between gap-3 px-5 py-3 border-b border-neutral-100 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
          >
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                {t('nav.family', 'Family')}
              </span>
              <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {family.name}
              </span>
            </span>
            <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-neutral-900 dark:bg-neutral-700 text-white'
                        : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {t(item.labelKey, item.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-neutral-100 dark:border-neutral-700 p-3 space-y-1">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50"
          >
            <LogOut className="w-5 h-5" />
            {t('actions.signOut', 'Sign out')}
          </button>
        </div>
      </div>
      </Drawer>
      <FamilySwitcherModal isOpen={isSwitcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
}
