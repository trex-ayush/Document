import { Link } from 'react-router-dom';
import { Skeleton } from './Skeleton.jsx';

/**
 * StatCard — a number with its label, a short sub-line and a big tinted "diamond" with the icon
 * (docs/UI_KIT.md "Design standard" → Cards). Used by the Home counts and the admin stats.
 *
 *   ┌──────────────────────────────┐
 *   │ 1.8 GB                  ◆    │   value (bold, large)
 *   │ Storage              ◆ [ic] ◆│   label (muted)
 *   │ ┄┄┄┄┄┄┄┄┄┄┄┄            ◆    │   dotted rule
 *   │ 1.8 GB of 62.7 GB            │   sub-line: tone-coloured part + muted part
 *   └──────────────────────────────┘
 *
 * The diamond is a rounded square turned 45°, centred on the card's right edge so the card cuts
 * it in half; it's filled with a soft gradient in the tone colour (strongest at the top, fading
 * out at the bottom), with the icon centred in the visible part.
 *
 * Phones (below `sm`): a compact card (~90px) — value and label on one line, a 72px diamond.
 * From `sm`: value above label, a 128px diamond. The sub-line is always one line (cut with "…"),
 * and the text column always stops before the diamond.
 *
 * Props:
 *  - value (node), label (string)
 *  - icon (lucide component)
 *  - tone: 'blue' | 'sky' | 'orange' | 'green' | 'violet' | 'primary' | 'neutral' (default)
 *  - sub: `{ strong?, muted? }` (strong in the tone colour, muted small grey) or any node
 *  - loading: placeholders of the same size
 *  - to (router link) | onClick (button) — makes the whole card clickable
 *  - className (grid placement)
 *
 * @example
 * <StatCard value={12} label="Documents" icon={FileText} tone="blue" sub={{ strong: 'Aadhaar, PAN', muted: 'and more' }} />
 */
const TONES = {
  blue: {
    diamond: 'from-blue-200 via-blue-100/70 dark:from-blue-500/35 dark:via-blue-500/10',
    icon: 'text-blue-600 dark:text-blue-400',
    strong: 'text-blue-600 dark:text-blue-400',
  },
  sky: {
    diamond: 'from-sky-200 via-sky-100/70 dark:from-sky-500/35 dark:via-sky-500/10',
    icon: 'text-sky-600 dark:text-sky-400',
    strong: 'text-sky-700 dark:text-sky-400',
  },
  orange: {
    diamond: 'from-orange-200 via-orange-100/70 dark:from-orange-500/35 dark:via-orange-500/10',
    icon: 'text-orange-600 dark:text-orange-400',
    strong: 'text-orange-600 dark:text-orange-400',
  },
  green: {
    diamond: 'from-green-200 via-green-100/70 dark:from-green-500/30 dark:via-green-500/10',
    icon: 'text-green-700 dark:text-green-400',
    strong: 'text-green-700 dark:text-green-400',
  },
  violet: {
    diamond: 'from-violet-200 via-violet-100/70 dark:from-violet-500/35 dark:via-violet-500/10',
    icon: 'text-violet-600 dark:text-violet-400',
    strong: 'text-violet-600 dark:text-violet-400',
  },
  primary: {
    diamond: 'from-primary-200 via-primary-100/70 dark:from-primary-500/35 dark:via-primary-500/10',
    icon: 'text-primary-600 dark:text-primary-400',
    strong: 'text-primary-600 dark:text-primary-400',
  },
  neutral: {
    diamond: 'from-neutral-300 via-neutral-200/70 dark:from-neutral-500/40 dark:via-neutral-500/10',
    icon: 'text-neutral-800 dark:text-neutral-200',
    strong: 'text-neutral-900 dark:text-neutral-100',
  },
};

const CARD =
  'relative block overflow-hidden rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 shadow-soft-xs sm:p-5 lg:p-6 dark:border-neutral-700 dark:bg-neutral-800';
const INTERACTIVE =
  'transition-shadow hover:shadow-soft-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400';

function Diamond({ tone, icon: Icon, loading }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 top-1/2 h-[72px] w-[72px] translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[14px] bg-linear-to-br to-transparent sm:h-32 sm:w-32 sm:rounded-[22px] ${
          loading ? 'from-neutral-200 via-neutral-100/70 dark:from-neutral-600/40 dark:via-neutral-600/10' : tone.diamond
        }`}
      />
      {Icon && !loading && (
        <Icon
          aria-hidden="true"
          strokeWidth={1.75}
          className={`pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 sm:right-6 sm:h-[26px] sm:w-[26px] ${tone.icon}`}
        />
      )}
    </>
  );
}

function SubLine({ sub, tone }) {
  if (!sub) return null;
  const isParts = typeof sub === 'object' && !Array.isArray(sub) && ('strong' in sub || 'muted' in sub);
  return (
    <p className="mt-2 truncate text-sm sm:mt-3">
      {isParts ? (
        <>
          {sub.strong != null && <span className={`font-semibold ${tone.strong}`}>{sub.strong}</span>}
          {sub.strong != null && sub.muted != null && ' '}
          {sub.muted != null && <span className="text-xs text-neutral-500 dark:text-neutral-400">{sub.muted}</span>}
        </>
      ) : (
        sub
      )}
    </p>
  );
}

export default function StatCard({ value, label, icon, tone = 'neutral', sub, loading = false, to, onClick, className = '' }) {
  const toneCls = TONES[tone] || TONES.neutral;
  const body = (
    <>
      <Diamond tone={toneCls} icon={icon} loading={loading} />
      {/* The text column stops before the diamond: 64px on phones (72px diamond), 96px from sm. */}
      <div className="relative min-w-0 pr-16 sm:pr-24">
        {loading ? (
          <div className="flex items-center gap-2 sm:block">
            <Skeleton className="h-7 w-12 sm:h-9 sm:w-16" />
            <Skeleton variant="line" height={14} width="45%" className="sm:mt-2" />
          </div>
        ) : (
          // Phones: value and label on one line (compact card). From sm: stacked.
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 sm:block">
            <p className="max-w-full truncate text-2xl font-bold tracking-tight tabular-nums text-neutral-900 sm:text-3xl dark:text-neutral-50">{value}</p>
            <p className="min-w-0 max-w-full truncate text-sm text-neutral-600 sm:mt-0.5 dark:text-neutral-400">{label}</p>
          </div>
        )}
        <div aria-hidden="true" className="mt-2 w-full max-w-40 border-t border-dotted border-neutral-300 sm:mt-3 dark:border-neutral-600" />
        {loading ? <Skeleton variant="line" width="70%" className="mt-3" /> : <SubLine sub={sub} tone={toneCls} />}
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
