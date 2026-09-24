import { useEffect, useState } from 'react';

/**
 * True when the viewport is narrower than `breakpoint` px (default 1024,
 * Tailwind's `lg` breakpoint — matches where AppShell switches from the
 * desktop sidebar to the mobile bottom-tab-bar + drawer). Used by Modal to
 * decide between a centered dialog and a bottom sheet, and by AppShell for
 * mobile-only chrome.
 *
 * Ported from apps/template/src/hooks/useIsMobile.js.
 *
 * @param {number} [breakpoint=1024]
 */
export function useIsMobile(breakpoint = 1024) {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);

  return isMobile;
}

export default useIsMobile;
