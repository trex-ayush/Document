/**
 * Badge — small static-tone pill. Use for fixed semantic labels (file kind,
 * role, a count).
 *
 * Ported verbatim from apps/template/src/components/ui/Badge.jsx.
 *
 * Props:
 *  - tone?      'gray' (default) | 'blue' | 'green' | 'yellow' | 'red' | 'purple'
 *  - className? appended last (Rule 8)
 *
 * @example
 * <Badge tone="green">Active</Badge>
 */
const TONES = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  red: 'bg-red-100 text-red-800',
  purple: 'bg-purple-100 text-purple-800',
};

const Badge = ({ tone = 'gray', className = '', children, ...rest }) => (
  <span
    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TONES[tone] || TONES.gray} ${className}`}
    {...rest}
  >
    {children}
  </span>
);

export default Badge;
