import { useEffect, useRef, useState } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside.js';

/**
 * Dropdown — minimal trigger -> menu wrapper. The caller owns the menu
 * content (usually `<DropdownItem>`s); this component owns open state and
 * outside-click / Escape handling.
 *
 * Ported from apps/component/src/components/ui/Dropdown.tsx (types
 * stripped, `cn` calls replaced with plain template strings since `clsx`
 * doesn't buy much for this small a component).
 *
 * Props:
 *  - trigger          ReactNode — wrapped in a `<button>`
 *  - align?           'left' (default) | 'right'
 *  - className?       extra classes on the menu panel
 *  - unstyledPanel?    boolean — drop the default radius/border/shadow/min-width
 *                       so the caller supplies the full panel skin
 *  - wrapperClassName? replaces the outer wrapper's default `inline-block` display
 *                       (e.g. `flex min-w-0` so a long trigger label can truncate)
 *  - triggerClassName? replaces the trigger span's default `inline-flex`
 *
 * @example
 * <Dropdown trigger={<Avatar user={user} />} align="right">
 *   <DropdownItem onSelect={openProfile}>Profile</DropdownItem>
 *   <DropdownDivider />
 *   <DropdownItem danger onSelect={logout}>Sign out</DropdownItem>
 * </Dropdown>
 */
export function Dropdown({
  trigger,
  children,
  align = 'left',
  className = '',
  unstyledPanel = false,
  wrapperClassName = '',
  triggerClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false));

  // Escape closes the menu too.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = () => setOpen((v) => !v);

  return (
    // Replace (not append to) the default display classes — two same-specificity display
    // utilities on one element race on stylesheet order, not source order.
    <div ref={ref} className={`relative ${wrapperClassName || 'inline-block'}`}>
      {/* A plain `<span>`, not `<button>` — every caller passes an already-interactive
          `<Button>`/icon-button as `trigger`, and nesting a real `<button>` inside
          another is invalid HTML that browsers handle inconsistently on touch. */}
      <span
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName || 'inline-flex'}
      >
        {trigger}
      </span>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={[
            'absolute z-50 mt-2 overflow-hidden animate-fade-in bg-white dark:bg-neutral-800 border',
            unstyledPanel ? '' : 'min-w-[200px] rounded-xl border-neutral-200 py-1 shadow-dropdown dark:border-neutral-700',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          ].join(' ')}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ onSelect, disabled, danger, children }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      disabled={disabled}
      className={`flex w-full min-h-11 lg:min-h-10 items-center px-4 py-2 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed ${
        danger ? 'text-red-600 dark:text-red-400' : 'text-neutral-700 dark:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />;
}

export default Dropdown;
