import { ACTION_LABELS } from './actionLabels.js';

const ACTION_OPTIONS = Object.entries(ACTION_LABELS)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label));

/**
 * ActivityFilters — filter bar for the Activity page: member, action, date
 * range. Props: `members` (Membership[]), `value` ({memberId,action,from,to}),
 * `onChange(next)`.
 */
export default function ActivityFilters({ members = [], value, onChange }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });

  const inputCls =
    'rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 min-h-[44px] w-full';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
      <select value={value.memberId} onChange={set('memberId')} className={inputCls}>
        <option value="">All members</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select value={value.action} onChange={set('action')} className={inputCls}>
        <option value="">All actions</option>
        {ACTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <input type="date" value={value.from} onChange={set('from')} className={inputCls} aria-label="From date" />
      <input type="date" value={value.to} onChange={set('to')} className={inputCls} aria-label="To date" />
    </div>
  );
}
