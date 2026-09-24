import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap.js';

/**
 * Drawer — side panel that slides in from an edge. Use for the mobile nav
 * menu (`side="left"`), row detail/edit panels (`side="right"`, the most
 * common use), and the mobile FAB action sheet (`side="bottom"`).
 *
 * Ported from apps/component/src/components/ui/Drawer.tsx (types stripped).
 * `focus-trap-react` isn't in our dependency list — uses the local
 * `useFocusTrap` hook instead. Per the design system's Rule 20 (and this
 * build's explicit mobile requirement), every side uses `h-[100dvh]`/
 * `top-0`, never `bottom-0` alone, so it always reaches the true visible
 * bottom on mobile browsers regardless of URL-bar chrome.
 *
 * Props:
 *  - isOpen, onClose (required)
 *  - side?             'left' | 'right' (default) | 'top' | 'bottom'
 *  - size?             'sm' | 'md' (default) | 'lg' | 'xl' | 'full'
 *  - title?, description?
 *  - closeOnBackdrop?  default true
 *  - closeOnEscape?    default true
 *  - hideCloseButton?  default false
 *  - hideBackdrop?     default false — for a persistent side panel
 *  - footer?           ReactNode, right-aligned action row
 *  - className?        appended to the panel (Rule 8)
 *
 * @example
 * <Drawer isOpen={open} onClose={close} side="left" title="Menu">
 *   <MobileNavLinks />
 * </Drawer>
 */
const HORIZONTAL_SIZE = {
  sm: 'w-full sm:max-w-md',
  md: 'w-full sm:max-w-lg md:max-w-xl',
  lg: 'w-full sm:w-[70vw] md:w-[60vw] lg:w-[55vw]',
  xl: 'w-full sm:w-[85vw] md:w-[75vw] lg:w-[65vw]',
  full: 'w-full',
};

const VERTICAL_SIZE = {
  sm: 'max-h-[33dvh]',
  md: 'max-h-[50dvh]',
  lg: 'max-h-[67dvh]',
  xl: 'max-h-[75dvh]',
  full: 'h-[100dvh]',
};

const POSITION = {
  left: 'top-0 left-0 h-[100dvh]',
  right: 'top-0 right-0 h-[100dvh]',
  top: 'top-0 left-0 right-0 w-full',
  bottom: 'bottom-0 left-0 right-0 w-full',
};

const SLIDE_IN = {
  left: 'animate-slide-in-left',
  right: 'animate-slide-in-right',
  top: 'animate-slide-in-down',
  bottom: 'animate-slide-in-up',
};

export function Drawer({
  isOpen,
  onClose,
  side = 'right',
  size = 'md',
  title,
  description,
  closeOnBackdrop = true,
  closeOnEscape = true,
  hideCloseButton = false,
  hideBackdrop = false,
  children,
  footer,
  className = '',
}) {
  const panelRef = useRef(null);
  useFocusTrap(panelRef, isOpen, { onClose, closeOnEscape });

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isHorizontal = side === 'left' || side === 'right';
  const sizeClass = isHorizontal ? HORIZONTAL_SIZE[size] || HORIZONTAL_SIZE.md : VERTICAL_SIZE[size] || VERTICAL_SIZE.md;
  const safeAreaClass = side === 'bottom' ? 'pb-[var(--safe-bottom)]' : side === 'top' ? 'pt-[var(--safe-top)]' : '';
  const roundedClass = side === 'bottom' ? 'rounded-t-2xl' : side === 'top' ? 'rounded-b-2xl' : '';
  const borderClass =
    side === 'left' ? 'border-r' : side === 'right' ? 'border-l' : side === 'top' ? 'border-b' : 'border-t';

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed top-0 left-0 right-0 h-[100dvh] z-[60]">
      {!hideBackdrop && (
        <div
          className="absolute top-0 left-0 right-0 h-[100dvh] bg-black/30 animate-fade-in"
          onClick={closeOnBackdrop ? onClose : undefined}
        />
      )}
      <aside
        ref={panelRef}
        data-drawer-panel
        tabIndex={-1}
        className={[
          'absolute flex flex-col bg-white dark:bg-neutral-800 shadow-2xl border-neutral-200 dark:border-neutral-700 focus:outline-none',
          borderClass,
          roundedClass,
          safeAreaClass,
          POSITION[side],
          sizeClass,
          SLIDE_IN[side],
          className,
        ].join(' ')}
      >
        {(title || !hideCloseButton) && (
          <header className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-100 dark:border-neutral-700">
            <div className="min-w-0">
              {title ? <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 truncate">{title}</h2> : null}
              {description ? <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p> : null}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </header>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex-shrink-0 px-5 py-3 border-t border-neutral-100 dark:border-neutral-700 flex items-center justify-end gap-2">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}

export default Drawer;
