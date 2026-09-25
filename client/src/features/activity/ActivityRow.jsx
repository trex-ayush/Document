import { useTranslation } from 'react-i18next';
import Avatar from '@/components/ui/Avatar.jsx';
import { continuationForAction, categoryOf } from './actionLabels.js';
import { formatRelativeTime } from '@/i18n/formatters.js';

const CATEGORY_DOT = {
  auth: 'bg-blue-400',
  document: 'bg-primary-400',
  folder: 'bg-amber-400',
  file: 'bg-primary-400',
  item: 'bg-purple-400',
  member: 'bg-green-400',
  family: 'bg-neutral-400',
  share: 'bg-pink-400',
};

/** ActivityRow — one entry in the Activity feed. Props: `activity` (docs/API.md Activity shape). */
export default function ActivityRow({ activity }) {
  const { t } = useTranslation('activity');
  const dot = CATEGORY_DOT[categoryOf(activity.action)] || 'bg-neutral-300';
  return (
    <div className="flex items-start gap-3 py-3 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <div className="flex-shrink-0 mt-1">
        <Avatar user={{ name: activity.actorName }} size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-neutral-800 dark:text-neutral-200">
          <span className="font-medium">{activity.actorName || t('row.someone', 'Someone')}</span>{' '}
          <span className="text-neutral-600 dark:text-neutral-400">{continuationForAction(activity.action, t)}</span>
        </p>
        {activity.meta && Object.keys(activity.meta).length > 0 && (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 truncate">
            {Object.entries(activity.meta)
              .slice(0, 3)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
              .join(' · ')}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
        <span className="text-xs text-neutral-400 whitespace-nowrap">{formatRelativeTime(activity.createdAt)}</span>
      </div>
    </div>
  );
}
