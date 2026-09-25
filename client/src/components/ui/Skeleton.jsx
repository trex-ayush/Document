import { CARD_PADDING, CARD_SURFACE, GRID_GAP, PAGE_PADDING, PAGE_WIDTH } from './tokens.js';

/**
 * Skeleton — soft grey placeholders shaped like the content that's loading, so nothing jumps
 * when it arrives. Spinners are only for small inline actions (a button's `loading`).
 *
 *  - <Skeleton />                       block (`height`, `width`, `rounded`)
 *  - <Skeleton variant="line" />        a line of text (12px, `width` default 100%)
 *  - <Skeleton variant="circle" size={40} />
 *
 * The pulse only runs when the device allows motion (`motion-safe:`). Composed skeletons below
 * match the real rows, cards, headers and form fields in size:
 * `SkeletonHeader`, `SkeletonRows`, `SkeletonCards`, `SkeletonFields`, `PageSkeleton`,
 * `AppShellSkeleton`.
 *
 * Props (Skeleton): variant?, height?, width?, size? (circle), rounded? ('none' | 'sm' | 'md' | 'lg' | 'full'), className?
 */
const ROUNDED = {
  none: 'rounded-none',
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  full: 'rounded-full',
};

export function Skeleton({ variant = 'block', height, width, size, rounded, className = '', style, ...rest }) {
  let dims = { height, width };
  let radius = ROUNDED[rounded] || ROUNDED.md;
  if (variant === 'line') {
    dims = { height: height ?? 12, width: width ?? '100%' };
    radius = ROUNDED[rounded] || ROUNDED.sm;
  } else if (variant === 'circle') {
    dims = { height: size ?? height ?? 40, width: size ?? height ?? 40 };
    radius = ROUNDED.full;
  }
  return (
    <div
      aria-hidden="true"
      className={`flex-shrink-0 bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-700 ${radius} ${className}`}
      style={{ ...dims, ...style }}
      {...rest}
    />
  );
}

/** Page header placeholder: title (and subtitle), same size and gap as PageHeader. */
export function SkeletonHeader({ subtitle = true, action = false }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between" aria-hidden="true">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-7 w-2/5 sm:h-8" />
        {subtitle && <Skeleton variant="line" height={14} width="60%" className="mt-2" />}
      </div>
      {action && <Skeleton height={40} width={120} />}
    </div>
  );
}

/** List rows placeholder, the same box and row height as `ListCard` + `ListRow`. */
export function SkeletonRows({ count = 5, action = false, avatar = false }) {
  return (
    <div className={`divide-y divide-neutral-100 overflow-hidden dark:divide-neutral-700 ${CARD_SURFACE}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-3 sm:px-5">
          {avatar ? <Skeleton variant="circle" size={40} /> : <Skeleton height={40} width={40} />}
          <div className="min-w-0 flex-1">
            <Skeleton variant="line" height={14} width={`${55 - (i % 3) * 10}%`} />
            <Skeleton variant="line" width={`${35 + (i % 2) * 10}%`} className="mt-2" />
          </div>
          {action && <Skeleton height={36} width={84} />}
        </div>
      ))}
    </div>
  );
}

/** Card/tile grid placeholder. `className` sets the grid columns; `tileHeight` the tile's min height. */
export function SkeletonCards({ count = 5, className = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5', tileHeight = 120 }) {
  return (
    <div className={`grid ${GRID_GAP} ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${CARD_SURFACE} ${CARD_PADDING}`} style={{ minHeight: tileHeight }}>
          <Skeleton height={40} width={40} />
          <Skeleton variant="line" height={14} width="70%" className="mt-3" />
          <Skeleton variant="line" width="40%" className="mt-2" />
        </div>
      ))}
    </div>
  );
}

/** Form placeholder inside a card: `count` label + field pairs, then a button on the right. */
export function SkeletonFields({ count = 3, button = true }) {
  return (
    <div className={`space-y-4 ${CARD_SURFACE} ${CARD_PADDING}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton variant="line" height={14} width={`${25 + (i % 3) * 8}%`} className="mb-1.5" />
          <Skeleton className="h-11 w-full lg:h-10" />
        </div>
      ))}
      {button && (
        <div className="flex justify-end">
          <Skeleton className="h-11 w-28 lg:h-10" />
        </div>
      )}
    </div>
  );
}

/** Generic page: header + rows, at the standard page width. */
export function PageSkeleton({ rows = 5 }) {
  return (
    <div className={`mx-auto w-full ${PAGE_WIDTH} ${PAGE_PADDING}`} role="status" aria-busy="true">
      <SkeletonHeader />
      <SkeletonRows count={rows} />
    </div>
  );
}

/**
 * Whole signed-in screen while the session is checked on refresh: the navbar, the PC sidebar,
 * the phone tab bar and a page skeleton — the same frame AppShell draws, in placeholder grey.
 */
export function AppShellSkeleton() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-neutral-50 dark:bg-neutral-950" role="status" aria-busy="true">
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-3 sm:h-16 sm:px-4 dark:border-neutral-700 dark:bg-neutral-800">
        <Skeleton height={36} width={36} className="hidden lg:block" />
        <Skeleton variant="line" height={18} width={150} />
        <div className="mx-auto hidden w-full max-w-[32rem] md:block">
          <Skeleton height={40} width="100%" />
        </div>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Skeleton height={32} width={112} className="hidden md:block" />
          <Skeleton variant="circle" size={36} />
        </div>
      </div>
      <div className="flex flex-1">
        <div className="hidden w-60 flex-shrink-0 flex-col gap-1 border-r border-neutral-200 bg-white px-3 py-4 lg:flex dark:border-neutral-700 dark:bg-neutral-800">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex min-h-11 items-center gap-3 pl-3">
              <Skeleton height={20} width={20} rounded="sm" />
              <Skeleton variant="line" width={`${45 + (i % 3) * 12}%`} />
            </div>
          ))}
        </div>
        <main className="min-w-0 flex-1 pb-20 lg:pb-0">
          <PageSkeleton />
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-neutral-200 bg-white pb-[var(--safe-bottom)] lg:hidden dark:border-neutral-700 dark:bg-neutral-800">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex min-h-[52px] flex-col items-center justify-center gap-1.5">
            <Skeleton height={20} width={20} rounded="sm" />
            <Skeleton variant="line" height={8} width={32} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default Skeleton;
