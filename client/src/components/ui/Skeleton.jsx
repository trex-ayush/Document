/**
 * Skeleton — pulse-animated placeholder for content that's still loading.
 * Compose several to mimic the shape of the real content (avatar + lines).
 * For a full loading state (spinner instead of content shape) use
 * `<Spinner>`; both are valid per Rule 13 — pick whichever gives the user a
 * better sense of what's coming.
 *
 * Ported verbatim from apps/component/src/components/ui/Skeleton.tsx (types stripped).
 *
 * Props: height?, width? (string | number, e.g. 20 or '70%'), rounded? ('sm' | 'md' default | 'lg' | 'full'), className?
 *
 * @example
 * <div className="flex items-center gap-3">
 *   <Skeleton height={36} width={36} rounded="full" />
 *   <Skeleton height={14} width="60%" />
 * </div>
 */
const ROUNDED = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  full: 'rounded-full',
};

export function Skeleton({ height, width, rounded = 'md', className = '', style, ...rest }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-neutral-200/70 dark:bg-neutral-700/70 ${ROUNDED[rounded] || ROUNDED.md} ${className}`}
      style={{ height, width, ...style }}
      {...rest}
    />
  );
}

export default Skeleton;
