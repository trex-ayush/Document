import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEYS, storage } from '@/services/storage.js';

/**
 * Light/dark theme context. Ported from apps/component/src/context/ThemeContext.tsx
 * (types stripped), with two changes required by our shell:
 *
 *  1. Storage key is the literal `'family-vault-theme'` (STORAGE_KEYS.theme) —
 *     MUST match the pre-mount script in client/index.html byte-for-byte, or
 *     the app flashes the wrong theme on load and then contradicts itself.
 *  2. Default (nothing saved yet) is the OS preference
 *     (`prefers-color-scheme: dark`), not a hardcoded 'light' — mirrors
 *     index.html's own pre-mount script so the context and the inline script
 *     never disagree about the initial theme.
 */

const ThemeContext = createContext(null);

function readInitialTheme() {
  const saved = storage.getRaw(STORAGE_KEYS.theme);
  if (saved === 'dark' || saved === 'light') return saved;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    storage.setRaw(STORAGE_KEYS.theme, theme);
  }, [theme]);

  // If the user never explicitly toggled in-app, keep following OS changes live.
  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mql) return undefined;
    const onChange = (e) => {
      // Only auto-follow if the user hasn't explicitly toggled in this app yet.
      const saved = storage.getRaw(STORAGE_KEYS.theme);
      if (saved !== 'dark' && saved !== 'light') {
        setThemeState(e.matches ? 'dark' : 'light');
      }
    };
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      isLight: theme === 'light',
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((prev) => (prev === 'light' ? 'dark' : 'light')),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Read and update the active theme (`'light' | 'dark'`). Persists to
 * localStorage under the key index.html's pre-mount script also reads, and
 * toggles the `dark` class on `<html>`.
 *
 * @example
 * const { theme, toggleTheme } = useTheme();
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

export default ThemeContext;
