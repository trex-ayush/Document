import { useRef, useState } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside.js';

/**
 * Dropdown — minimal trigger -> menu wrapper. The caller owns the menu
 * content (usually `<DropdownItem>`s); this component owns open state and
 * outside-click handling.
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
 *
 * @example
 * <Dropdown trigger={<Avatar user={user} />} align="right">
 *   <DropdownItem onSelect={openProfile}>Profile</DropdownItem>
 *   <DropdownDivider />
 *   <DropdownItem danger onSelect={logout}>Sign out</DropdownItem>
 * </Dropdown>
 */
export function Dropdown({ trigger, children, align = 'left', className = '', unstyledPanel = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false));

  const toggle = () => setOpen((v) => !v);

  return (
    <div ref={ref} className="relative inline-block">
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
        className="inline-flex"
      >
        {trigger}
      </span>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={[
            'absolute z-50 mt-2 overflow-hidden animate-fade-in bg-white dark:bg-neutral-800 border',
            unstyledPanel ? '' : 'min-w-[180px] rounded-lg border-neutral-200 dark:border-neutral-700 shadow-lg',
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
      className={`w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed ${
        danger ? 'text-red-600 dark:text-red-400' : 'text-neutral-700 dark:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="h-px bg-neutral-100 dark:bg-neutral-700" />;
}

export default Dropdown;
