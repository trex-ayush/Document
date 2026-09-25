import { useTranslation } from 'react-i18next';
import Select from '@/components/ui/Select.jsx';
import Input from '@/components/ui/Input.jsx';
import { ACTION_LABELS, labelForAction } from './actionLabels.js';

/**
 * ActivityFilters — filter bar for the Activity page: member, action, date
 * range. Props: `members` (Membership[]), `value` ({memberId,action,from,to}),
 * `onChange(next)`.
 */
export default function ActivityFilters({ members = [], value, onChange }) {
  const { t, i18n } = useTranslation('activity');
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });

  // Recomputed on every render (cheap, small list) so it re-sorts in the
  // active language whenever `i18n.language` changes — same non-memoized
  // pattern as Dashboard's `itemKindLabels`.
  const actionOptions = Object.keys(ACTION_LABELS)
    .map((code) => ({ value: code, label: labelForAction(code, t) }))
    .sort((a, b) => a.label.localeCompare(b.label, i18n.language));

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Select value={value.memberId} onChange={set('memberId')} aria-label={t('filters.allMembers', 'All members')}>
        <option value="">{t('filters.allMembers', 'All members')}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Select>

      <Select value={value.action} onChange={set('action')} aria-label={t('filters.allActions', 'All actions')}>
        <option value="">{t('filters.allActions', 'All actions')}</option>
        {actionOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>

      <Input type="date" value={value.from} onChange={set('from')} aria-label={t('filters.fromDateLabel', 'From date')} />
      <Input type="date" value={value.to} onChange={set('to')} aria-label={t('filters.toDateLabel', 'To date')} />
    </div>
  );
}
