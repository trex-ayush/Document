import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PersonAvatar from './PersonAvatar.jsx';
import { personPath } from './peopleUtils.js';

/**
 * One big tap target on the member-first home: avatar, name, relation and how many documents
 * that person has. `member = null` renders the "Shared (whole family)" tile.
 * `count` is optional — omitted while stats are still loading.
 */
export default function PersonTile({ member, count, isYou = false }) {
  const { t } = useTranslation(['dashboard', 'common']);
  const name = member ? member.name : t('common:people.shared', 'Shared (whole family)');
  const sub = member
    ? (isYou ? t('common:people.you', 'You') : member.relation) || ''
    : t('common:people.sharedHint', 'Not tied to one person');

  return (
    <Link
      to={personPath(member)}
      className="flex min-h-[136px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-neutral-200 bg-white p-3 text-center transition-colors hover:border-primary-400 active:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:active:bg-neutral-700/60"
    >
      <PersonAvatar member={member} />
      <span className="w-full truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100" title={name}>
        {name}
      </span>
      {sub && (
        <span className="w-full truncate text-xs text-neutral-500 dark:text-neutral-400" title={sub}>
          {sub}
        </span>
      )}
      {typeof count === 'number' && (
        <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
          {t('common:units.document', '{{count}} documents', { count })}
        </span>
      )}
    </Link>
  );
}
