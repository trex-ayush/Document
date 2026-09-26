import { LoaderCircle } from 'lucide-react';
/**
 * Button — the one clickable-button primitive (docs/UI_KIT.md "Design standard" → Buttons).
 * Never hand-roll a `<button>` styled as a button; true icon-only controls use `size="icon"`.
 *
 * Variants (by meaning):
 *  - primary      : coral solid — the single main action of a view (Save, Add, Create link)
 *  - secondary    : bordered surface — every other action, and Cancel
 *  - ghost        : no border — low-emphasis/tertiary actions and icon buttons
 *  - danger       : red solid — the confirming step of a destructive action (Move to Bin, Revoke)
 *  - danger-ghost : red text, no border — a button that starts a destructive action (Delete in a header)
 *  - link         : inline text action, no padding
 *  - bare         : no colour classes — only for brand buttons (the green WhatsApp button)
 *
 * Sizes: md (default everywhere — 44px on phones, 40px from `lg`), sm (dense rows and toolbars
 * only), icon (square icon-only control, same height as md). Radius, icon size (h-4 w-4) and
 * icon gap (gap-2) are fixed.
 *
 * Other props: block (full width), loading (disables + spinner), leftIcon/rightIcon,
 * as (polymorphic: Link, 'a'…), className (layout only — width, margins, flex).
 *
 * @example
 * <Button loading={saving} leftIcon={<Plus className="h-4 w-4" />}>Add</Button>
 * <Button as={Link} to="/browse" variant="secondary">Open folders</Button>
 * <Button variant="ghost" size="icon" aria-label="Close"><X className="h-5 w-5" /></Button>
 */
const VARIANTS = {
  primary: 'bg-primary-500 text-white shadow-soft-sm hover:bg-primary-600',
  secondary:
    'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700',
  ghost: 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  'danger-ghost': 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20',
  // ghost + size="icon": icon-only controls are a step quieter than text buttons.
  'ghost-icon': 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100',
  link: 'text-primary-600 underline-offset-2 hover:underline dark:text-primary-400',
  bare: '',
};

// Old variant names still accepted so nothing renders unstyled.
const ALIASES = { outline: 'secondary', dark: 'secondary', success: 'secondary', warning: 'secondary' };

const SIZES = {
  md: 'min-h-11 lg:min-h-10 px-4 text-sm',
  sm: 'min-h-10 lg:min-h-9 px-3 text-sm',
  icon: 'h-11 w-11 lg:h-10 lg:w-10 flex-shrink-0 p-0',
};
const SIZE_ALIASES = { lg: 'md', xs: 'sm', compact: 'sm' };

/** Classes for an icon-only control that can't be a `<Button>` (e.g. a Dropdown trigger span). */
export const ICON_BUTTON_CLASS =
  'inline-flex h-11 w-11 lg:h-10 lg:w-10 flex-shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100';

const ROUNDED = {
  none: 'rounded-none',
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};

const WEIGHT = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const Button = ({
  as: As = 'button',
  variant = 'primary',
  size = 'md',
  rounded = 'lg',
  weight = 'medium',
  block = false,
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  className = '',
  children,
  type,
  ...rest
}) => {
  // `in`, not `||`: the `bare` variant is an empty string on purpose.
  const s = SIZE_ALIASES[size] || size;
  let v = ALIASES[variant] || variant;
  if (v === 'ghost' && s === 'icon') v = 'ghost-icon';
  const variantCls = v in VARIANTS ? VARIANTS[v] : VARIANTS.primary;
  const sizeCls = v === 'link' ? '' : SIZES[s] || SIZES.md;
  const roundedCls = ROUNDED[rounded] ?? ROUNDED.lg;
  const weightCls = WEIGHT[weight] ?? WEIGHT.medium;

  return (
    <As
      // A plain <button> defaults to type="button": inside a form, only an explicit
      // type="submit" should submit (a "Remove" or "Edit" button must never save the form).
      type={As === 'button' ? type || 'button' : type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 ${weightCls} ${variantCls} ${sizeCls} ${roundedCls} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && (
        <LoaderCircle className="animate-spin h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      )}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </As>
  );
};

export default Button;
