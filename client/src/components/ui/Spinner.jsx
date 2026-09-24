/**
 * Spinner — animated loading indicator. Two shapes:
 *  - bar:  `border-b-2 border-{color}` ring with a transparent bottom edge —
 *          page/section-level loading (most common).
 *  - ring: full border + transparent top edge — small inline contexts
 *          (buttons, action menus).
 *
 * Ported from apps/template/src/components/ui/Spinner.jsx. Added a `primary`
 * color preset (our coral brand token) alongside the original set, and made
 * it the default instead of `blue` since this app has no blue in its palette.
 *
 * Props:
 *  - size?    'xs' | 'sm' | 'md' (default) | 'lg' | 'xl' | '2xl'
 *  - color?   'primary' (default) | 'purple' | 'green' | 'red' | 'amber' | 'orange' | 'neutral' | 'gray' | 'white' | 'current' | 'bare'
 *  - variant? 'bar' (default) | 'ring'
 *  - className? appended last; pass full `border-*` classes with color="bare" for a one-off color (Rule 8)
 *
 * @example
 * <Spinner size="xl" />
 * <Spinner size="xs" color="white" variant="ring" /> // inside a filled button
 */
const SIZE_CLASS = {
  xs: 'h-3 w-3 border-2',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-b-2',
  xl: 'h-12 w-12 border-b-2',
  '2xl': 'h-16 w-16 border-b-2',
};

// Static Tailwind classes — required so the JIT picks them up at build time (Rule 5).
const COLOR = {
  primary: { bar: 'border-primary-500', ring: 'border-primary-500 border-t-transparent' },
  purple: { bar: 'border-purple-600', ring: 'border-purple-600 border-t-transparent' },
  green: { bar: 'border-green-600', ring: 'border-green-400 border-t-transparent' },
  red: { bar: 'border-red-600', ring: 'border-red-500 border-t-transparent' },
  amber: { bar: 'border-amber-600', ring: 'border-amber-500 border-t-transparent' },
  orange: { bar: 'border-orange-500', ring: 'border-orange-400 border-t-transparent' },
  neutral: { bar: 'border-neutral-900 dark:border-white', ring: 'border-neutral-400 dark:border-neutral-100 border-t-transparent' },
  gray: { bar: 'border-gray-400', ring: 'border-gray-400 border-t-transparent' },
  white: { bar: 'border-white', ring: 'border-white/30 border-t-white' },
  current: { bar: 'border-current', ring: 'border-current border-t-transparent' },
  bare: { bar: '', ring: 'border-t-transparent' },
};

const Spinner = ({ size = 'md', color = 'primary', variant = 'bar', className = '', ...rest }) => {
  const sizeCls = SIZE_CLASS[size] || SIZE_CLASS.md;
  const colorCls = (COLOR[color] || COLOR.primary)[variant === 'ring' ? 'ring' : 'bar'];

  return (
    <div
      role="status"
      aria-label="Loading"
      className={`animate-spin rounded-full ${sizeCls} ${colorCls} ${className}`}
      {...rest}
    />
  );
};

export default Spinner;
