import { Link } from 'react-router-dom';
import { Skeleton } from './Skeleton.jsx';

/**
 * StatCard — a summary card: a big value with its label, a short dotted rule, a small breakdown
 * list, and a big tinted "diamond" with the icon (docs/UI_KIT.md "Design standard" → Cards).
 * Used by the Home counts and the admin Overview / System numbers.
 *
 *   ┌──────────────────────────────┐
 *   │ 16                      ◆    │   value (bold, large)
 *   │ Saved                ◆ [ic] ◆│   label (muted)
 *   │ ┄┄┄┄┄┄┄┄┄┄┄┄            ◆    │   dotted rule
 *   │ ▫ Documents        9    ◆    │   rows: tinted icon, label, number on the right
 *   │ ▫ Passwords        5         │
 *   └──────────────────────────────┘
 *
 * The diamond is a rounded square turned 45°, centred on the card's right edge so the card cuts
 * it in half; it's filled with a soft gradient in the tone colour (strongest at the top, fading
 * out at the bottom), with the icon centred in the visible part. The text column always stops
 * before the diamond, so nothing runs under it.
 *
 * Phones (below `sm`): compact — a 64px diamond and a 12px row text, so two cards fit side by
 * side on a 360px screen. From `sm`: a 128px diamond and 14px rows with a tinted icon tile.
 * Labels are cut with "…" rather than wrapping; a long value (e.g. a mail server name) is cut at 60%.
 *
 * Props:
 *  - value (node), label (string)
 *  - icon (lucide component)
 *  - tone: 'blue' | 'sky' | 'orange' | 'green' | 'violet' | 'primary' | 'neutral' (default)
 *  - rows: `[{ key, icon, label, value, to? }]` — 2–4 breakdown lines. A row with `to` is a
 *    link (at least 40px tall); row links are ignored when the whole card is a link.
 *  - loading: placeholders of the same size
 *  - to (router link) | onClick (button) — makes the whole card clickable
 *  - className (grid placement)
 *
 * @example
 * <StatCard value={16} label="Saved" icon={Archive} tone="primary"
 *   rows={[{ key: 'docs', icon: FileText, label: 'Documents', value: 9 }]} />
 */
const TONES = {
  blue: {
    diamond: 'from-blue-200 via-blue-100/70 dark:from-blue-500/35 dark:via-blue-500/10',
    icon: 'text-blue-600 dark:text-blue-400',
    tile: 'sm:bg-blue-50 sm:dark:bg-blue-500/15',
  },
  sky: {
    diamond: 'from-sky-200 via-sky-100/70 dark:from-sky-500/35 dark:via-sky-500/10',
    icon: 'text-sky-600 dark:text-sky-400',
    tile: 'sm:bg-sky-50 sm:dark:bg-sky-500/15',
  },
  orange: {
    diamond: 'from-orange-200 via-orange-100/70 dark:from-orange-500/35 dark:via-orange-500/10',
    icon: 'text-orange-600 dark:text-orange-400',
    tile: 'sm:bg-orange-50 sm:dark:bg-orange-500/15',
  },
  green: {
    diamond: 'from-green-200 via-green-100/70 dark:from-green-500/30 dark:via-green-500/10',
    icon: 'text-green-700 dark:text-green-400',
    tile: 'sm:bg-green-50 sm:dark:bg-green-500/15',
  },
  violet: {
    diamond: 'from-violet-200 via-violet-100/70 dark:from-violet-500/35 dark:via-violet-500/10',
    icon: 'text-violet-600 dark:text-violet-400',
    tile: 'sm:bg-violet-50 sm:dark:bg-violet-500/15',
  },
  primary: {
    diamond: 'from-primary-200 via-primary-100/70 dark:from-primary-500/35 dark:via-primary-500/10',
    icon: 'text-primary-600 dark:text-primary-400',
    tile: 'sm:bg-primary-50 sm:dark:bg-primary-500/15',
  },
  neutral: {
    diamond: 'from-neutral-300 via-neutral-200/70 dark:from-neutral-500/40 dark:via-neutral-500/10',
    icon: 'text-neutral-800 dark:text-neutral-200',
    tile: 'sm:bg-neutral-100 sm:dark:bg-neutral-700',
  },
};

const CARD =
  'relative block overflow-hidden rounded-2xl border border-neutral-200 bg-white px-3 py-3.5 shadow-soft-xs sm:p-5 lg:p-6 dark:border-neutral-700 dark:bg-neutral-800';
const INTERACTIVE =
  'transition-shadow hover:shadow-soft-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400';

function Diamond({ tone, icon: Icon, loading }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 top-1/2 h-16 w-16 translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[13px] bg-linear-to-br to-transparent sm:h-32 sm:w-32 sm:rounded-[22px] ${
          loading ? 'from-neutral-200 via-neutral-100/70 dark:from-neutral-600/40 dark:via-neutral-600/10' : tone.diamond
        }`}
      />
      {Icon && !loading && (
        <Icon
          aria-hidden="true"
          strokeWidth={1.75}
          className={`pointer-events-none absolute right-2 top-1/2 h-[18px] w-[18px] -translate-y-1/2 sm:right-6 sm:h-[26px] sm:w-[26px] ${tone.icon}`}
        />
      )}
    </>
  );
}

const ROW = 'flex min-w-0 items-center gap-1 text-xs sm:gap-2.5 sm:text-sm';

function Row({ row, tone, linked }) {
  const { icon: Icon, label, value, to } = row;
  const inner = (
    <>
      {Icon && (
        <span className={`flex shrink-0 items-center justify-center rounded-md sm:h-7 sm:w-7 ${tone.tile}`}>
          <Icon aria-hidden="true" strokeWidth={1.75} className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${tone.icon}`} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-neutral-300">{label}</span>
      <span className="max-w-[60%] shrink-0 truncate font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</span>
    </>
  );
  if (to && linked) {
    return (
      <li>
        <Link
          to={to}
          className={`${ROW} -mx-1.5 min-h-10 rounded-lg px-1.5 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-primary-400 dark:hover:bg-neutral-700/50`}
        >
          {inner}
        </Link>
      </li>
    );
  }
  return <li className={`${ROW} min-h-6 sm:min-h-8`}>{inner}</li>;
}

export default function StatCard({ value, label, icon, tone = 'neutral', rows = [], loading = false, to, onClick, className = '' }) {
  const toneCls = TONES[tone] || TONES.neutral;
  const cardLinked = Boolean((to || onClick) && !loading);
  const body = (
    <>
      <Diamond tone={toneCls} icon={icon} loading={loading} />
      {/* The text column stops where the diamond starts: 32px on phones (64px diamond), 96px from sm. */}
      <div className="relative min-w-0 pr-8 sm:pr-24">
        {loading ? (
          <>
            <Skeleton className="h-7 w-12 sm:h-9 sm:w-16" />
            <Skeleton variant="line" height={14} width="45%" className="mt-1.5 sm:mt-2" />
          </>
        ) : (
          <>
            <p className="max-w-full truncate text-2xl font-bold tracking-tight tabular-nums text-neutral-900 sm:text-3xl dark:text-neutral-50">{value}</p>
            <p className="min-w-0 max-w-full truncate text-sm text-neutral-600 sm:mt-0.5 dark:text-neutral-400">{label}</p>
          </>
        )}
        <div aria-hidden="true" className="mt-2 w-full max-w-40 border-t border-dotted border-neutral-300 sm:mt-3 dark:border-neutral-600" />
        {rows.length > 0 && (
          <ul className="mt-1.5 sm:mt-2.5">
            {loading
              ? rows.map((r) => (
                <li key={r.key} className={`${ROW} min-h-6 sm:min-h-8`}>
                  <Skeleton variant="line" height={12} width="80%" />
                </li>
              ))
              : rows.map((r) => <Row key={r.key} row={r} tone={toneCls} linked={!cardLinked} />)}
          </ul>
        )}
      </div>
    </>
  );

  if (to && !loading) {
    return (
      <Link to={to} className={`${CARD} ${INTERACTIVE} ${className}`}>
        {body}
      </Link>
    );
  }
  if (onClick && !loading) {
    return (
      <button type="button" onClick={onClick} className={`${CARD} ${INTERACTIVE} w-full text-left ${className}`}>
        {body}
      </button>
    );
  }
  return (
    <div className={`${CARD} ${className}`} aria-busy={loading || undefined}>
      {body}
    </div>
  );
}
