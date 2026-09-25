import Drawer from './Drawer.jsx';

/**
 * Modal — same API as before, but every modal is now a right-side slide-in
 * drawer on all viewports (full width on phones, capped width on larger
 * screens according to `size`). Focus trap, Esc, backdrop close and body
 * scroll lock come from Drawer. `mobileVariant` is accepted and ignored.
 *
 * Props: isOpen, onClose, title?, description?, size? ('sm'|'md'|'lg'|'xl'|'full'),
 * closeOnBackdrop?, closeOnEscape?, hideCloseButton?, footer?, className?
 */
const DRAWER_SIZE = { sm: 'sm', md: 'md', lg: 'md', xl: 'lg', full: 'full' };

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  // eslint-disable-next-line no-unused-vars
  mobileVariant,
  closeOnBackdrop = true,
  closeOnEscape = true,
  hideCloseButton = false,
  children,
  footer,
  className = '',
}) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      side="right"
      size={DRAWER_SIZE[size] || 'md'}
      title={title}
      description={description}
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
      hideCloseButton={hideCloseButton}
      className={className}
      footer={
        footer ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end pb-[var(--safe-bottom)]">
            {footer}
          </div>
        ) : null
      }
    >
      {children}
    </Drawer>
  );
}

export default Modal;
