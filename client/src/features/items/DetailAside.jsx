import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Folder } from 'lucide-react';
import Avatar from '@/components/ui/Avatar.jsx';
import { Skeleton } from '@/components/ui/Skeleton.jsx';
import { CARD_SURFACE } from '@/components/ui/tokens.js';
import { continuationForAction } from '@/features/activity/actionLabels.js';
import { formatDate, formatRelativeTime } from '@/i18n/formatters.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

const ACTIVITY_SHOWN = 5;
// Saves within a minute of creating it don't count as a change.
const CHANGED_AFTER_MS = 60 * 1000;

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v >= 10 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

/** One "About this" row; `tip` says in a few words what the row means (hover / keyboard). */
function Row({ label, tip, children }) {
  const row = (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="flex-shrink-0 text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-neutral-900 dark:text-neutral-100">{children}</dd>
    </div>
  );
  if (!tip) return row;
  return (
    <Tooltip content={tip} position="left" className="grid">
      {row}
    </Tooltip>
  );
}

function CardTitle({ children }) {
  return <h2 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{children}</h2>;
}

/** The last few things that happened to this item (views, edits, files, share links). */
function RecentActivity({ activity }) {
  const { t } = useTranslation(['items', 'activity']);
  const { data, isLoading, isError } = useQuery({ ...activity, staleTime: 30 * 1000 });
  const rows = (data?.items || []).slice(0, ACTIVITY_SHOWN);
  if (isError) return null;
  return (
    <section className={`${CARD_SURFACE} px-4 py-3 sm:px-5`}>
      <CardTitle>{t('aside.recentActivity', 'Recent activity')}</CardTitle>
      {isLoading ? (
        <div className="space-y-3 py-2">
          <Skeleton variant="line" width="80%" />
          <Skeleton variant="line" width="60%" />
        </div>
      ) : rows.length ? (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 py-2">
              <Avatar user={{ name: a.actorName }} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  <span className="font-medium">{a.actorName || t('activity:row.someone', 'Someone')}</span>{' '}
                  <span className="text-neutral-600 dark:text-neutral-400">{continuationForAction(a.action, t)}</span>
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{formatRelativeTime(a.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-sm text-neutral-500 dark:text-neutral-400">{t('aside.noActivity', 'No activity yet.')}</p>
      )}
    </section>
  );
}

/**
 * Side panel of the password, note and document pages: "About this …" (folder, who added it and
 * when, last change, and for documents the files) and "Recent activity" for it. Only facts the
 * server returned are shown. From lg it's a sticky column beside the content; below lg it sits
 * under the content as a "Details" section, closed until tapped.
 *
 * Props: kind ('login'|'note'|'document'), record ({ createdAt, updatedAt, createdByName?,
 * updatedByName?, files? }), folderPath ([{ id, name }]), activity (react-query { queryKey,
 * queryFn }, or null to hide the activity card — read-only members can't see activity)
 */
export default function DetailAside({ kind, record, folderPath = [], activity = null }) {
  const { t } = useTranslation('items');
  const [open, setOpen] = useState(false);

  const title = {
    login: t('aside.aboutPassword', 'About this password'),
    note: t('aside.aboutNote', 'About this note'),
    document: t('aside.aboutDocument', 'About this document'),
  }[kind];
  const folder = folderPath[folderPath.length - 1];
  const created = record.createdAt ? new Date(record.createdAt) : null;
  const updated = record.updatedAt ? new Date(record.updatedAt) : null;
  const changed = created && updated && updated - created > CHANGED_AFTER_MS;
  const files = Array.isArray(record.files) ? record.files : null;
  const size = files ? formatSize(files.reduce((sum, f) => sum + (f.size || 0), 0)) : null;

  return (
    <aside className="lg:sticky lg:top-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 text-sm font-semibold text-neutral-700 lg:hidden dark:text-neutral-300"
      >
        {t('aside.details', 'Details')}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <div className={`space-y-4 ${open ? 'mt-2' : 'hidden'} lg:mt-0 lg:block`}>
        <section className={`${CARD_SURFACE} px-4 py-3 sm:px-5`}>
          <CardTitle>{title}</CardTitle>
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {folder && (
              <Row label={t('aside.folder', 'Folder')} tip={t('tip.asideFolder', 'The folder it is kept in')}>
                <Link to={`/browse/${folder.id}`} className="inline-flex max-w-full items-center gap-1.5 font-medium text-primary-600 hover:underline dark:text-primary-400">
                  <Folder className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{folder.name}</span>
                </Link>
              </Row>
            )}
            {record.createdByName && <Row label={t('aside.addedBy', 'Added by')} tip={t('tip.asideAddedBy', 'Who saved it first')}>{record.createdByName}</Row>}
            {created && <Row label={t('aside.addedOn', 'Added on')} tip={t('tip.asideAddedOn', 'The day it was saved')}>{formatDate(created)}</Row>}
            {changed && (
              <Row label={t('aside.lastChanged', 'Last changed')} tip={t('tip.asideChanged', 'When someone last changed it')}>
                <Tooltip content={formatDate(updated)} className="inline">
                  <span>
                    {record.updatedByName
                      ? t('aside.changedBy', '{{when}} by {{name}}', { when: formatRelativeTime(updated), name: record.updatedByName })
                      : formatRelativeTime(updated)}
                  </span>
                </Tooltip>
              </Row>
            )}
            {files && (
              <Row label={t('aside.files', 'Files')} tip={t('tip.asideFiles', 'How many files, and how big')}>
                {size
                  ? t('aside.filesWithSize', '{{count}} files · {{size}}', { count: files.length, size })
                  : t('aside.fileCount', '{{count}} files', { count: files.length })}
              </Row>
            )}
          </dl>
        </section>
        {activity && <RecentActivity activity={activity} />}
      </div>
    </aside>
  );
}
