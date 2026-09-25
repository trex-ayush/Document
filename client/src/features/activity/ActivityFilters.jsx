import { useTranslation } from 'react-i18next';
import SelectMenu from '@/components/ui/SelectMenu.jsx';
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
      <SelectMenu
        aria-label={t('filters.allMembers', 'All members')}
        value={value.memberId}
        onChange={(memberId) => onChange({ ...value, memberId })}
        options={[{ value: '', label: t('filters.allMembers', 'All members') }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
      />

      <SelectMenu
        aria-label={t('filters.allActions', 'All actions')}
        value={value.action}
        onChange={(action) => onChange({ ...value, action })}
        options={[{ value: '', label: t('filters.allActions', 'All actions') }, ...actionOptions]}
      />

      <Input type="date" value={value.from} onChange={set('from')} aria-label={t('filters.fromDateLabel', 'From date')} />
      <Input type="date" value={value.to} onChange={set('to')} aria-label={t('filters.toDateLabel', 'To date')} />
    </div>
  );
}
