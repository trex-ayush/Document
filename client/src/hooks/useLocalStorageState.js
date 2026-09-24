import { useCallback, useEffect, useState } from 'react';

/**
 * useLocalStorageState — like `useState`, but persisted to `localStorage`
 * under `key`. Used by Browse's grid/list view-mode toggle (no such hook
 * existed in the UI kit yet — Agent D's `ViewModeToggle` primitive is
 * unopinionated about persistence, docs/UI_KIT.md §6.21). Never throws
 * (private browsing / quota / SSR all degrade to plain in-memory state),
 * matching `services/storage.js`'s own never-throw contract.
 *
 * @param {string} key
 * @param {*} defaultValue
 * @returns {[*, (value:*)=>void]}
 */
export function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? defaultValue : JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore (quota / private mode)
    }
  }, [key, value]);

  const setPersisted = useCallback((next) => {
    setValue((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  return [value, setPersisted];
}

export default useLocalStorageState;
