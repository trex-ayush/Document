import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Minimal focus trap for a portal-rendered panel (Modal, Drawer). While
 * `isOpen`:
 *  - moves focus into the panel (first focusable element, or the panel
 *    itself if it has none)
 *  - Tab / Shift+Tab cycle within the panel instead of escaping to the page
 *  - Escape calls `onClose` (when `closeOnEscape`)
 *  - on close, restores focus to whatever was focused before the panel opened
 *
 * Not a full a11y library (no MutationObserver for focusables added after
 * open) — `focus-trap-react`, used by the reference apps/component
 * implementation, isn't in docs/DECISIONS.md's client dependency list, so
 * this hook replaces it for Modal/Drawer/ConfirmModal.
 *
 * @param {import('react').RefObject<HTMLElement>} panelRef
 * @param {boolean} isOpen
 * @param {{ onClose?: () => void, closeOnEscape?: boolean }} [options]
 */
export function useFocusTrap(panelRef, isOpen, { onClose, closeOnEscape = true } = {}) {
  const previouslyFocused = useRef(null);
  // The latest onClose, read when Escape is pressed. Kept out of the effect's dependencies: callers
  // often pass a new function on every render, and re-running the effect on each keystroke would
  // pull focus out of the field being typed in (back to the panel's first button).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    previouslyFocused.current = document.activeElement;

    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null)
        : [];

    const toFocus = focusables()[0] || panel;
    toFocus?.focus?.();

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && closeOnEscape && onCloseRef.current) {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, panelRef, closeOnEscape]);
}
