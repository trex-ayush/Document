import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '@/hooks/useFocusTrap.js';
import { useVisualViewport } from '@/hooks/useVisualViewport.js';
import { X } from 'lucide-react';
import Button from './Button.jsx';
import Tooltip from './Tooltip.jsx';

/**
 * Drawer — side panel that slides in from an edge. Use for the mobile nav
 * menu (`side="left"`), row detail/edit panels (`side="right"`, the most
 * common use), and the mobile FAB action sheet (`side="bottom"`).
 *
 * Ported from apps/component/src/components/ui/Drawer.tsx (types stripped).
 * `focus-trap-react` isn't in our dependency list — uses the local
 * `useFocusTrap` hook instead. Per the design system's Rule 20 (and this
 * build's explicit mobile requirement), the dialog frame is sized with a
 * top + height (`.vv-frame`: 100dvh, or just the part above the on-screen
 * keyboard while one is open — see useVisualViewport), never `bottom-0`
 * alone, so the footer always sits at the true visible bottom on phones.
 *
 * Props:
 *  - isOpen, onClose (required)
 *  - side?             'left' | 'right' (default) | 'top' | 'bottom'
 *  - size?             'sm' | 'md' (default) | 'lg' | 'xl' | 'full' | 'nav' (the phone "More" menu:
 *                      85% wide, max 20rem, so the dimmed page stays visible)
 *  - title?, description?
 *  - closeOnBackdrop?  default true
 *  - closeOnEscape?    default true
 *  - hideCloseButton?  default false
 *  - hideBackdrop?     default false — for a persistent side panel
 *  - hideHeader?       default false — no title/close row (the panel draws its own;
 *                      `title` is still used as the dialog's aria-label)
 *  - bodyClassName?    replaces the body's default `px-4 py-4 sm:px-5` padding
 *  - footer?           ReactNode — the Buttons of the action row, as siblings (a fragment).
 *                      One footer layout everywhere: buttons share the row equally, Cancel
 *                      first and the primary action last (on the right); a single button
 *                      fills the row. Safe-area padding is added here, not by callers.
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
  nav: 'w-[85%] max-w-xs',
};

// Percent of the dialog frame, which is 100dvh normally and just the part above the
// keyboard while one is open (`.vv-frame`, set by useVisualViewport).
const VERTICAL_SIZE = {
  sm: 'max-h-[33%]',
  md: 'max-h-[50%]',
  lg: 'max-h-[67%]',
  xl: 'max-h-[75%]',
  full: 'h-full',
};

const POSITION = {
  left: 'top-0 left-0 h-full',
  right: 'top-0 right-0 h-full',
  top: 'top-0 left-0 right-0 w-full',
  bottom: 'bottom-0 left-0 right-0 w-full',
};

const SLIDE_IN = {
  left: 'animate-slide-in-left',
  right: 'animate-slide-in-right',
  top: 'animate-slide-in-down',
  bottom: 'animate-slide-in-up',
};

function Drawer({
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
  hideHeader = false,
  bodyClassName = 'px-4 py-4 sm:px-5',
  children,
  footer,
  className = '',
}) {
  const { t } = useTranslation('common');
  const panelRef = useRef(null);
  useFocusTrap(panelRef, isOpen, { onClose, closeOnEscape });
  useVisualViewport();

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
    <div role="dialog" aria-modal="true" aria-label={title} className="vv-frame fixed left-0 right-0 z-[60]">
      {!hideBackdrop && (
        <div
          className="absolute inset-0 bg-black/30 animate-fade-in"
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
        {!hideHeader && (title || !hideCloseButton) && (
          <header className="flex-shrink-0 flex items-center justify-between gap-3 py-3 pl-4 pr-2 sm:pl-5 sm:pr-3 border-b border-neutral-200 dark:border-neutral-700">
            <div className="min-w-0">
              {title ? (
                // One line; a long title (e.g. a folder name) is cut with "…" and shown whole on hover.
                <Tooltip content={typeof title === 'string' ? title : null} onlyWhenOverflow position="bottom" className="flex min-w-0">
                  <h2 className="min-w-0 text-base font-semibold text-neutral-900 dark:text-neutral-100 truncate">{title}</h2>
                </Tooltip>
              ) : null}
              {description ? <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p> : null}
            </div>
            {!hideCloseButton && (
              <Tooltip content={t('tip.close', 'Close')}>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('actions.close', 'Close')}>
                  <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                </Button>
              </Tooltip>
            )}
          </header>
        )}

        <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${bodyClassName}`}>{children}</div>

        {footer ? (
          <footer className="flex-shrink-0 flex items-center gap-2 border-t border-neutral-200 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] sm:px-5 dark:border-neutral-700 *:flex-1">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}

export default Drawer;
