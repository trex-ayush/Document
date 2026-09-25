import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { useTheme } from '@/context/ThemeContext.jsx';
import Avatar from '@/components/ui/Avatar.jsx';
import { Dropdown, DropdownDivider, DropdownItem } from '@/components/ui/Dropdown.jsx';
import FamilySwitcher from './FamilySwitcher.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import NavbarSearch from '@/features/search/NavbarSearch.jsx';
import { LogOut, Moon, Settings, Sun } from 'lucide-react';

/**
 * Navbar — top bar. Left: logo + `FamilySwitcher`. Centre (tablet/PC): the live search box
 * (`NavbarSearch`), truly centred — the bar is a 3-column grid with equal side columns, so
 * the box sits in the middle of the screen whatever is on the left or right. Right: the
 * language switcher and the user menu (Settings, theme, Sign out).
 *
 * On phones there's no search box here — the bottom bar's Search tab opens /search.
 */
export default function Navbar() {
  const { t } = useTranslation('common');
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="sticky top-0 z-40 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center h-14 sm:h-16 gap-2 px-3 sm:px-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)_minmax(0,1fr)] md:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)_minmax(0,1fr)]">
        <div className="flex flex-1 items-center gap-2.5 min-w-0">
          <img
            src="/assets/logo.png"
            alt="Family Vault"
            width={256}
            height={234}
            decoding="async"
            className="hidden lg:block h-9 w-auto flex-shrink-0"
          />
          <FamilySwitcher />
        </div>

        <div className="hidden md:block min-w-0">
          <NavbarSearch />
        </div>

        <div className="ml-auto flex items-center justify-end gap-1 flex-shrink-0 min-w-0">
          {/* Wrapping divs carry the hidden/md:inline-flex toggle instead of passing it
              straight into LanguageSwitcher's own className — that component already sets
              its own unconditional `inline-flex`, and two same-specificity display utilities
              on one element race based on Tailwind's generated stylesheet order, not source
              order, so both variants could render at once. */}
          <div className="hidden md:inline-flex">
            <LanguageSwitcher variant="segmented" />
          </div>
          <div className="md:hidden">
            <LanguageSwitcher variant="compact" />
          </div>

          {user && (
            <Dropdown
              align="right"
              trigger={
                <span className="flex items-center gap-2 px-1.5 py-1.5 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors">
                  <Avatar user={user} size="md" />
                </span>
              }
            >
              <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-700">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">{user.name}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">{user.email}</p>
              </div>
              <div className="py-1">
                <DropdownItem onSelect={() => navigate('/settings')}>
                  <span className="inline-flex items-center gap-2.5">
                    <Settings className="w-4 h-4 text-neutral-400" /> {t('nav.settings', 'Settings')}
                  </span>
                </DropdownItem>
                <DropdownItem onSelect={toggleTheme}>
                  <span className="inline-flex items-center gap-2.5">
                    {isDark ? (
                      <Sun className="w-4 h-4 text-neutral-400" />
                    ) : (
                      <Moon className="w-4 h-4 text-neutral-400" />
                    )}
                    {isDark ? t('theme.switchToLight', 'Switch to light mode') : t('theme.switchToDark', 'Switch to dark mode')}
                  </span>
                </DropdownItem>
              </div>
              <DropdownDivider />
              <div className="py-1">
                <DropdownItem onSelect={handleLogout}>
                  <span className="inline-flex items-center gap-2.5">
                    <LogOut className="w-4 h-4 text-neutral-400" /> {t('actions.signOut', 'Sign out')}
                  </span>
                </DropdownItem>
              </div>
            </Dropdown>
          )}
        </div>
      </div>
    </nav>
  );
}
