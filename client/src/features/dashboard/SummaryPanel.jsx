import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/Skeleton.jsx';

const ICON_TONE = {
  primary: 'text-primary-600 dark:text-primary-400',
  green: 'text-green-700 dark:text-green-400',
  sky: 'text-sky-600 dark:text-sky-400',
  violet: 'text-violet-600 dark:text-violet-400',
  neutral: 'text-neutral-700 dark:text-neutral-300',
};

const ROW = 'flex min-h-8 min-w-0 items-center gap-1.5 rounded-md text-sm';

function Row({ row, tone }) {
  const { icon: Icon, label, value, to } = row;
  const inner = (
    <>
      {Icon && <Icon aria-hidden="true" strokeWidth={1.75} className={`h-4 w-4 shrink-0 ${ICON_TONE[tone] || ICON_TONE.neutral}`} />}
      <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-neutral-300">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</span>
    </>
  );
  if (to) {
    return (
      <li>
        <Link
          to={to}
          className={`${ROW} -mx-1.5 px-1.5 hover:bg-neutral-100 active:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-primary-400 dark:hover:bg-neutral-700/60 dark:active:bg-neutral-700`}
        >
          {inner}
        </Link>
      </li>
    );
  }
  return <li className={ROW}>{inner}</li>;
}

/**
 * SummaryPanel — the phone version of the Home numbers: one full-width card split into two
 * halves by a thin divider, no decoration. Each half has its title with the big total on the
 * right, then a few rows (tinted icon, label, number on the right; a row with `to` is a link).
 * Rows line up across both halves; a half with fewer rows just ends sooner.
 *
 * Props: sections: `[{ key, title, total, tone, rows: [{ key, icon, label, value, to? }] }]`
 * (two; `total: null` = title only, the header keeps its height so the halves still line up),
 * loading, className.
 */
export default function SummaryPanel({ sections, loading = false, className = '' }) {
  return (
    <div
      className={`grid grid-cols-2 divide-x divide-neutral-200 rounded-2xl border border-neutral-200 bg-white py-3 shadow-soft-xs dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 ${className}`}
      aria-busy={loading || undefined}
    >
      {sections.map((section) => (
        <section key={section.key} aria-label={section.title} className="min-w-0 px-3">
          <div className="flex min-h-9 items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">{section.title}</h2>
            {section.total == null ? null : loading ? (
              <Skeleton className="h-6 w-8" />
            ) : (
              <span className="shrink-0 text-2xl font-bold tracking-tight tabular-nums text-neutral-900 dark:text-neutral-50">{section.total}</span>
            )}
          </div>
          <ul className="mt-1">
            {loading
              ? section.rows.map((r) => (
                <li key={r.key} className={ROW}>
                  <Skeleton variant="line" height={12} width="85%" />
                </li>
              ))
              : section.rows.map((r) => <Row key={r.key} row={r} tone={section.tone} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
