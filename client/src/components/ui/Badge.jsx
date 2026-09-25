/**
 * Badge — small static-tone pill. Use for fixed semantic labels (file kind,
 * role, a count).
 *
 * Ported from apps/template/src/components/ui/Badge.jsx (neutral greys, explicit dark tones).
 *
 * Props:
 *  - tone?      'gray' (default) | 'blue' | 'green' | 'yellow' | 'red' | 'purple'
 *  - className? appended last (Rule 8)
 *
 * @example
 * <Badge tone="green">Active</Badge>
 */
// gray = neutral label, blue = info, purple = role, and green/yellow/red only for
// success/warning/danger meaning (docs/UI_KIT.md "Design standard" → Colour).
const TONES = {
  gray: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  yellow: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  purple: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
};

const Badge = ({ tone = 'gray', className = '', children, ...rest }) => (
  <span
    className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${TONES[tone] || TONES.gray} ${className}`}
    {...rest}
  >
    {children}
  </span>
);

export default Badge;
