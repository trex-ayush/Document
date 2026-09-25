import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '@/hooks/useFocusTrap.js';
import { useIsMobile } from '@/hooks/useIsMobile.js';
import { X } from 'lucide-react';

/**
 * Modal — centered, focus-trapped dialog with header/body/footer slots.
 * Locks body scroll while open. Use `<Drawer>` instead for a side panel that
 * keeps page context visible.
 *
 * **Mobile-adaptive**: below the `lg` breakpoint, Modal renders as a bottom
 * sheet (slides up from the bottom, rounded top corners, drag handle,
 * safe-area bottom padding) instead of a centered dialog — the build plan
 * calls this out as a required mobile pattern, and a bottom sheet is easier
 * to reach one-handed than a centered dialog on a phone. Pass
 * `mobileVariant="center"` to opt a specific modal out (rare — e.g. a modal
 * that must stay small, like a single confirm dialog) and keep it centered
 * on all viewports.
 *
 * Ported from apps/component/src/components/ui/Modal.tsx (types stripped).
 * `focus-trap-react` isn't in docs/DECISIONS.md's dependency list, so focus
 * trapping is done by the local `useFocusTrap` hook instead.
 *
 * Props:
 *  - isOpen, onClose (required)
 *  - title?, description?
 *  - size?            'sm' | 'md' (default) | 'lg' | 'xl' | 'full' — ignored on mobile sheet (always full-width)
 *  - mobileVariant?    'sheet' (default) | 'center'
 *  - closeOnBackdrop?  default true
 *  - closeOnEscape?    default true
 *  - hideCloseButton?  default false
 *  - footer?           ReactNode, right-aligned action row
 *  - className?        appended to the panel (Rule 8)
 *
 * @example
 * <Modal isOpen={open} onClose={close} title="Add member" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={save}>Save</Button></>}>
 *   <MemberForm />
 * </Modal>
 */
const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw] max-h-[95dvh]',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  mobileVariant = 'sheet',
  closeOnBackdrop = true,
  closeOnEscape = true,
  hideCloseButton = false,
  children,
  footer,
  className = '',
}) {
  const { t } = useTranslation('common');
  const panelRef = useRef(null);
  const isMobile = useIsMobile();
  const asSheet = isMobile && mobileVariant === 'sheet';

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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`fixed top-0 left-0 right-0 h-[100dvh] z-50 flex animate-fade-in ${asSheet ? 'items-end' : 'items-center justify-center p-4'}`}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[100dvh] bg-black/40 backdrop-blur-[1px]"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        data-modal-panel
        tabIndex={-1}
        className={[
          'relative w-full flex flex-col bg-white dark:bg-neutral-800 shadow-2xl border border-neutral-200 dark:border-neutral-700 focus:outline-none',
          asSheet
            ? 'rounded-t-2xl max-h-[85dvh] animate-slide-in-up pb-[var(--safe-bottom)]'
            : `rounded-2xl max-h-[90dvh] overflow-hidden animate-scale-in ${SIZE_CLASSES[size] || SIZE_CLASSES.md}`,
          className,
        ].join(' ')}
      >
        {asSheet && (
          <div className="flex justify-center pt-2 pb-1 flex-shrink-0" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-600" />
          </div>
        )}
        {(title || !hideCloseButton) && (
          <header className="flex-shrink-0 flex items-start justify-between px-6 pt-3 pb-4 border-b border-neutral-100 dark:border-neutral-700">
            <div className="min-w-0">
              {title ? <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2> : null}
              {description ? <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p> : null}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('closeDialog', 'Close dialog')}
                className="ml-4 -mr-2 -mt-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </header>
        )}
        <div className="overflow-y-auto min-h-0 flex-1 px-6 py-5">{children}</div>
        {footer ? (
          <footer className="flex-shrink-0 px-6 py-4 border-t border-neutral-100 dark:border-neutral-700 flex items-center justify-end gap-2">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
