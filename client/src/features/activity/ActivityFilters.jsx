import { useTranslation } from 'react-i18next';
import { ACTION_LABELS, labelForAction } from './actionLabels.js';

/**
 * ActivityFilters — filter bar for the Activity page: member, action, date
 * range. Props: `members` (Membership[]), `value` ({memberId,action,from,to}),
 * `onChange(next)`.
 */
export default function ActivityFilters({ members = [], value, onChange }) {
  const { t, i18n } = useTranslation('activity');
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });

  const inputCls =
    'rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 min-h-[44px] w-full';

  // Recomputed on every render (cheap, small list) so it re-sorts in the
  // active language whenever `i18n.language` changes — same non-memoized
  // pattern as Dashboard's `itemKindLabels`.
  const actionOptions = Object.keys(ACTION_LABELS)
    .map((code) => ({ value: code, label: labelForAction(code, t) }))
    .sort((a, b) => a.label.localeCompare(b.label, i18n.language));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
      <select value={value.memberId} onChange={set('memberId')} className={inputCls}>
        <option value="">{t('filters.allMembers', 'All members')}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select value={value.action} onChange={set('action')} className={inputCls}>
        <option value="">{t('filters.allActions', 'All actions')}</option>
        {actionOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <input
        type="date"
        value={value.from}
        onChange={set('from')}
        className={inputCls}
        aria-label={t('filters.fromDateLabel', 'From date')}
      />
      <input
        type="date"
        value={value.to}
        onChange={set('to')}
        className={inputCls}
        aria-label={t('filters.toDateLabel', 'To date')}
      />
    </div>
  );
}
