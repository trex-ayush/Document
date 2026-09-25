import { Skeleton, SkeletonRows } from './Skeleton.jsx';

/**
 * Loading, error and notice blocks — one look everywhere (docs/UI_KIT.md "Design standard").
 *
 *  - <LoadingState />            skeleton rows for a loading section (`compact`: a few skeleton
 *                                lines, for inside a card). Pages can use the shaped skeletons in
 *                                Skeleton.jsx directly.
 *  - <ErrorState>text</ErrorState> centred red message when a section fails to load
 *  - <InlineError>text</InlineError> red message under a form or action (left-aligned)
 *  - <Notice tone="warning">…</Notice> soft banner: 'info' (neutral) | 'warning' (amber) | 'success' (green) |
 *                                'error' (red, announced as an alert — e.g. "Invalid email or password" on a form)
 */
export function LoadingState({ compact = false, className = '' }) {
  if (compact) {
    return (
      <div role="status" aria-busy="true" className={`space-y-3 py-2 ${className}`}>
        <Skeleton variant="line" height={14} width="70%" />
        <Skeleton variant="line" height={14} width="55%" />
        <Skeleton variant="line" height={14} width="40%" />
      </div>
    );
  }
  return (
    <div role="status" aria-busy="true" className={className}>
      <SkeletonRows count={4} />
    </div>
  );
}

export function ErrorState({ children, className = '' }) {
  return (
    <p role="alert" className={`py-12 text-center text-sm text-red-600 dark:text-red-400 ${className}`}>
      {children}
    </p>
  );
}

export function InlineError({ children, className = '' }) {
  if (!children) return null;
  return (
    <p role="alert" className={`text-sm text-red-600 dark:text-red-400 ${className}`}>
      {children}
    </p>
  );
}

const NOTICE_TONE = {
  info: 'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100',
  success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-200',
  error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200',
};

export function Notice({ tone = 'info', className = '', children }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={`rounded-lg border px-4 py-3 text-sm ${NOTICE_TONE[tone] || NOTICE_TONE.info} ${className}`}
    >
      {children}
    </div>
  );
}
