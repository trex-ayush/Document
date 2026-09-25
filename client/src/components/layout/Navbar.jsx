import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { useTheme } from '@/context/ThemeContext.jsx';
import Avatar from '@/components/ui/Avatar.jsx';
import { Dropdown, DropdownDivider, DropdownItem } from '@/components/ui/Dropdown.jsx';
import FamilySwitcher from './FamilySwitcher.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import { LogOut, Menu, Moon, Search, Settings, Sun } from 'lucide-react';

/**
 * Navbar — top bar: mobile hamburger (opens MobileDrawer), brand +
 * `FamilySwitcher` (multi-family accounts — docs/API.md "Multi-family
 * sessions"; was a plain `family?.name` text span, now an interactive
 * switcher/create dropdown), a global search trigger (navigates to /search —
 * Agent E/F builds the actual search page; this is just the entry point), a
 * standalone `LanguageSwitcher` (visible with no login and no menu to open —
 * a family member who only reads Hindi needs to switch before anything else
 * on screen makes sense to them; `segmented` at `md`+ where both language
 * names fit comfortably, `compact` below that so the icon row doesn't
 * overflow at phone widths), and the user menu (name/email, Settings link,
 * a theme-mode item, Sign out — the theme toggle used to be its own
 * standalone icon button here, moved into this menu since it's an account/
 * appearance preference, not a global-reach action like search or language).
 *
 * Props: onOpenDrawer (mobile hamburger handler)
 */
export default function Navbar({ onOpenDrawer }) {
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
      <div className="flex items-center h-14 sm:h-16 gap-2 px-3 sm:px-4">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label={t('nav.openMenu', 'Open menu')}
          className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-600"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex flex-1 md:flex-initial items-center gap-2.5 min-w-0">
          <img
            src="/assets/logo.png"
            alt="Family Vault"
            width={256}
            height={234}
            decoding="async"
            className="hidden sm:block h-9 w-auto flex-shrink-0"
          />
          <FamilySwitcher />
        </div>

        <button
          type="button"
          onClick={() => navigate('/search')}
          className="hidden md:flex flex-1 items-center gap-2 mx-4 max-w-md px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm text-neutral-400 dark:text-neutral-500 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
        >
          <Search className="w-4 h-4" />
          <span>{t('nav.searchPlaceholder', 'Search documents, folders, items...')}</span>
        </button>


        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => navigate('/search')}
            aria-label={t('actions.search', 'Search')}
            className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >
            <Search className="w-5 h-5" />
          </button>

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
