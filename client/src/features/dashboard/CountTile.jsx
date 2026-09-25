import Skeleton from '@/components/ui/Skeleton.jsx';
import { CARD_PADDING, CARD_SURFACE, KIND_TONE } from '@/components/ui/tokens.js';

/** One count on the Home page: icon, big number, label. Shows a placeholder while loading. */
export default function CountTile({ icon: Icon, label, value, loading = false, tone = KIND_TONE.document }) {
  return (
    <div className={`min-w-0 ${CARD_SURFACE} ${CARD_PADDING}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      {loading ? (
        <Skeleton height={32} width="50%" className="mt-2" />
      ) : (
        <p className="mt-2 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</p>
      )}
      <p className="truncate text-xs font-medium text-neutral-500 sm:text-sm dark:text-neutral-400">{label}</p>
    </div>
  );
}
