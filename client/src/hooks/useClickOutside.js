import { useEffect } from 'react';

/**
 * Calls `handler` when a pointerdown/touchstart fires outside the element
 * held by `ref`. Used by Dropdown, the user menu, and any other
 * click-away-to-close popover.
 *
 * Ported from apps/component/src/hooks/useClickOutside.ts, types stripped.
 *
 * @param {import('react').RefObject<HTMLElement>} ref
 * @param {(event: MouseEvent | TouchEvent) => void} handler
 * @param {boolean} [enabled=true]
 */
export function useClickOutside(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const listener = (event) => {
      const el = ref.current;
      if (!el || el.contains(event.target)) return;
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler, enabled]);
}
