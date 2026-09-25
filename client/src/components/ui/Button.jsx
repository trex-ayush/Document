import { LoaderCircle } from 'lucide-react';
/**
 * Button — flexible primitive for every clickable surface in the app.
 * Ported from apps/template/src/components/ui/Button.jsx, adapted to our
 * coral brand token (`primary-*` from tailwind.config.js) instead of the
 * template's hardcoded blue, and with the PTM-only `ai` (purple gradient)
 * variant dropped.
 *
 * Variants:
 *  - primary   : coral solid — the main call-to-action (Save, Upload, Sign in)
 *  - secondary : white/neutral surface with border (Cancel, secondary actions)
 *  - dark      : neutral-900 solid (alternate high-contrast action)
 *  - outline   : transparent with border (toolbar buttons)
 *  - ghost     : transparent, no border (icon buttons, menu triggers)
 *  - success   : green outline pill
 *  - warning   : amber (destructive-adjacent, non-danger warnings)
 *  - danger    : red solid (delete, revoke)
 *  - link      : underline-only, no padding
 *  - bare      : no color classes — caller supplies everything via className
 *
 * Sizes: xs, sm, md (default), lg, compact (responsive px-3 sm:px-4 + text-xs sm:text-sm), icon (square, icon-only)
 *
 * Other props:
 *  - rounded?   'sm' | 'md' | 'lg' (default) | 'xl' | 'full' | 'none'
 *  - weight?    'normal' | 'medium' (default) | 'semibold' | 'bold'
 *  - block?     boolean — full width when true
 *  - loading?   boolean — disables the button and swaps children for a spinner
 *  - leftIcon / rightIcon — JSX nodes (hidden while loading)
 *  - as         — polymorphic ('button' default; pass Link, 'a', etc. — Rule 9)
 *  - className  — appended last, can override via Tailwind `!` modifier (Rule 8)
 *  - ...rest    — forwarded to the underlying element (onClick, type, disabled, aria-*)
 *
 * @example
 * <Button variant="primary" loading={saving} leftIcon={<PlusIcon />}>Upload</Button>
 * <Button as={Link} to="/browse" variant="ghost" size="icon"><ChevronIcon /></Button>
 */
const VARIANTS = {
  primary:
    'bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 shadow-soft-sm',
  secondary:
    'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50',
  dark:
    'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 shadow-soft-sm',
  outline:
    'bg-transparent border border-neutral-300 dark:border-neutral-600 text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50',
  ghost:
    'bg-transparent text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50',
  success:
    'bg-white dark:bg-neutral-800 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20',
  warning:
    'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/50',
  danger:
    'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
  link:
    'bg-transparent text-primary-600 dark:text-primary-400 underline-offset-2 hover:underline px-0 py-0',
  bare: '',
};

const SIZES = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
  compact: 'px-3 sm:px-4 py-1.5 text-xs sm:text-sm',
  icon: 'p-2 text-sm',
};

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
  ...rest
}) => {
  // `in`, not `||`: the `bare` variant is an empty string on purpose.
  const variantCls = variant in VARIANTS ? VARIANTS[variant] : VARIANTS.primary;
  const sizeCls = variant === 'link' ? '' : SIZES[size] || SIZES.md;
  const roundedCls = ROUNDED[rounded] ?? ROUNDED.lg;
  const weightCls = WEIGHT[weight] ?? WEIGHT.medium;

  return (
    <As
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 transition-colors duration-200 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 ${weightCls} ${variantCls} ${sizeCls} ${roundedCls} ${block ? 'w-full' : ''} ${className}`}
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
