import { NavLink, useNavigate } from 'react-router-dom';
import Drawer from '@/components/ui/Drawer.jsx';
import Avatar from '@/components/ui/Avatar.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { useTheme } from '@/context/ThemeContext.jsx';
import { NAV_ITEMS } from './navConfig.js';
import { LogoutIcon, MoonIcon, SunIcon } from './icons.jsx';

/**
 * MobileDrawer — full nav menu for phones/tablets, opened by the navbar
 * hamburger or the tab bar's "More" button. Shows every NAV_ITEMS entry
 * (not just the 4 in the tab bar), the current user, a theme toggle, and
 * sign out. Built on the `Drawer` primitive (`side="left"`), which already
 * follows Rule 20 (`h-[100dvh]`, not `top-X bottom-0`).
 *
 * Props: isOpen, onClose
 */
export default function MobileDrawer({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} side="left" size="sm" title="Menu" hideBackdrop={false}>
      <div className="flex flex-col h-full -mx-5 -my-4">
        {user && (
          <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100 dark:border-neutral-700">
            <Avatar user={user} size="lg" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">{user.name}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{user.email}</p>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="space-y-1 px-3">
            {NAV_ITEMS.map((item) => (
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
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-neutral-100 dark:border-neutral-700 p-3 space-y-1">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50"
          >
            {isDark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50"
          >
            <LogoutIcon className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </div>
    </Drawer>
  );
}
