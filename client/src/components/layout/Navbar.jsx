import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext.jsx';
import { useTheme } from '@/context/ThemeContext.jsx';
import Avatar from '@/components/ui/Avatar.jsx';
import { Dropdown, DropdownDivider, DropdownItem } from '@/components/ui/Dropdown.jsx';
import { LogoMark, LogoutIcon, MenuIcon, MoonIcon, SearchIcon, SettingsIcon, SunIcon } from './icons.jsx';

/**
 * Navbar — top bar: mobile hamburger (opens MobileDrawer), brand, a global
 * search trigger (navigates to /search — Agent E/F builds the actual search
 * page; this is just the entry point), theme toggle, and the user menu
 * (name/email, theme shortcut, Settings link, Sign out).
 *
 * Props: onOpenDrawer (mobile hamburger handler)
 */
export default function Navbar({ onOpenDrawer }) {
  const { user, family, logout } = useAuth();
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
          aria-label="Open menu"
          className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-600"
        >
          <MenuIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 bg-neutral-900 dark:bg-neutral-700 rounded-lg items-center justify-center hidden sm:flex flex-shrink-0">
            <LogoMark className="w-4 h-4 text-white" />
          </div>
          <span className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {family?.name || 'Family Vault'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => navigate('/search')}
          className="hidden md:flex flex-1 items-center gap-2 mx-4 max-w-md px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm text-neutral-400 dark:text-neutral-500 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
        >
          <SearchIcon className="w-4 h-4" />
          <span>Search documents, folders, items...</span>
        </button>

        <div className="flex-1 md:hidden" />

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => navigate('/search')}
            aria-label="Search"
            className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >
            <SearchIcon className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >
            {isDark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>

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
                    <SettingsIcon className="w-4 h-4 text-neutral-400" /> Settings
                  </span>
                </DropdownItem>
              </div>
              <DropdownDivider />
              <div className="py-1">
                <DropdownItem onSelect={handleLogout}>
                  <span className="inline-flex items-center gap-2.5">
                    <LogoutIcon className="w-4 h-4 text-neutral-400" /> Sign out
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
