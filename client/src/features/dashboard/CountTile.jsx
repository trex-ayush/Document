import Skeleton from '@/components/ui/Skeleton.jsx';

/** One count on the Home page: icon, big number, label. Shows a placeholder while loading. */
export default function CountTile({ icon: Icon, label, value, loading = false, tone = 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300' }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {loading ? (
        <Skeleton height={28} width="50%" className="mt-2.5" />
      ) : (
        <p className="mt-2 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</p>
      )}
      <p className="mt-0.5 truncate text-xs font-medium text-neutral-500 sm:text-sm dark:text-neutral-400">{label}</p>
    </div>
  );
}
