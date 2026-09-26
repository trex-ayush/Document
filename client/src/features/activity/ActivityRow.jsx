import { useTranslation } from 'react-i18next';
import Avatar from '@/components/ui/Avatar.jsx';
import { ListRow } from '@/components/ui/ListRow.jsx';
import { continuationForAction, categoryOf } from './actionLabels.js';
import { formatDateTime, formatRelativeTime } from '@/i18n/formatters.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

// Same kind colours as the row icons elsewhere (tokens.js KIND_ICON): folder = primary,
// password/note = sky/violet, people = sky, everything else neutral.
const CATEGORY_DOT = {
  auth: 'bg-sky-400',
  document: 'bg-neutral-400',
  folder: 'bg-primary-400',
  file: 'bg-neutral-400',
  item: 'bg-violet-400',
  member: 'bg-sky-400',
  family: 'bg-neutral-400',
  share: 'bg-primary-400',
};

/** ActivityRow — one entry in the Activity feed. Props: `activity` (docs/API.md Activity shape). */
export default function ActivityRow({ activity }) {
  const { t } = useTranslation('activity');
  const dot = CATEGORY_DOT[categoryOf(activity.action)] || 'bg-neutral-300';
  const meta = activity.meta && Object.keys(activity.meta).length > 0
    ? Object.entries(activity.meta)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join(' · ')
    : null;
  return (
    <ListRow
      icon={<Avatar user={{ name: activity.actorName }} size="md" />}
      wrapTitle
      title={
        <>
          {activity.actorName || t('row.someone', 'Someone')}{' '}
          <span className="font-normal text-neutral-600 dark:text-neutral-400">{continuationForAction(activity.action, t)}</span>
        </>
      }
      meta={meta}
      actions={
        <span className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
          {/* "2 hours ago" — the exact day and time on hover. */}
          <Tooltip content={formatDateTime(activity.createdAt)} position="left">
            <span className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">{formatRelativeTime(activity.createdAt)}</span>
          </Tooltip>
        </span>
      }
    />
  );
}
