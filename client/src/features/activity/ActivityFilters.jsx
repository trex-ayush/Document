import { useTranslation } from 'react-i18next';
import FilterBar from '@/components/ui/FilterBar.jsx';
import { ACTION_LABELS, labelForAction } from './actionLabels.js';

/**
 * ActivityFilters — the Activity page's filters (member, action, date range) in the shared
 * FilterBar: a labelled row on PC, a "Filters" bottom sheet on phones, pills for what is chosen.
 * Props: `members` (Membership[]), `value` ({memberId,action,from,to}), `onChange(next)`.
 */
export default function ActivityFilters({ members = [], value, onChange, className = '' }) {
  const { t, i18n } = useTranslation('activity');

  // Recomputed on every render (cheap, small list) so it re-sorts in the
  // active language whenever `i18n.language` changes — same non-memoized
  // pattern as Dashboard's `itemKindLabels`.
  const actionOptions = Object.keys(ACTION_LABELS)
    // Platform-admin actions are never part of a family's own activity.
    .filter((code) => !code.startsWith('admin.'))
    .map((code) => ({ value: code, label: labelForAction(code, t) }))
    .sort((a, b) => a.label.localeCompare(b.label, i18n.language));

  const filters = [
    {
      key: 'memberId',
      label: t('filters.memberLabel', 'Member'),
      type: 'select',
      allLabel: t('filters.allMembers', 'All members'),
      options: members.map((m) => ({ value: m.id, label: m.name })),
    },
    {
      key: 'action',
      label: t('filters.actionLabel', 'What happened'),
      type: 'select',
      allLabel: t('filters.allActions', 'All actions'),
      options: actionOptions,
    },
    { key: 'from', label: t('filters.fromDateLabel', 'From date'), type: 'date' },
    { key: 'to', label: t('filters.toDateLabel', 'To date'), type: 'date' },
  ];

  return <FilterBar className={className} filters={filters} values={value} onChange={onChange} />;
}
