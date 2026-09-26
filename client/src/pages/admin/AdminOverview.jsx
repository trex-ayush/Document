import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Activity, FileText, Files, Folder, House, KeyRound, Link2, MailPlus, StickyNote, UserPlus, UserX, Users } from 'lucide-react';
import StatCard from '@/components/ui/StatCard.jsx';
import SummaryPanel from '@/features/dashboard/SummaryPanel.jsx';
import { Skeleton } from '@/components/ui/Skeleton.jsx';
import { GRID_GAP, SECTION_GAP, TEXT_LINK } from '@/components/ui/tokens.js';
import { adminApi } from '@/services/adminApi.js';
import { LoadingState } from '@/components/ui/PageState.jsx';
import { AdminActivityList, ErrorBlock, Section, formatBytes, formatCount } from './adminShared.jsx';

/** Horizontal bars, longest = full width. Each row links to that family's details. */
function TopFamilies({ families }) {
  const { t } = useTranslation('admin');
  if (!families?.length) {
    return <p className="py-2 text-sm text-neutral-500 dark:text-neutral-400">{t('overview.storage.empty', 'No files saved yet')}</p>;
  }
  const max = Math.max(...families.map((f) => Number(f.bytes) || 0), 1);
  return (
    <ul className="-mx-2 space-y-1">
      {families.map((f) => (
        <li key={f.id}>
          <Link
            to={`/admin/families?open=${encodeURIComponent(f.id)}`}
            className="block min-h-11 rounded-lg px-2 py-2 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-primary-400 dark:hover:bg-neutral-700/40"
          >
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-neutral-800 dark:text-neutral-200">{f.name}</span>
              <span className="shrink-0 tabular-nums text-neutral-500 dark:text-neutral-400">{formatBytes(f.bytes)}</span>
            </span>
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
              <span
                className="block h-full rounded-full bg-green-500 dark:bg-green-400"
                style={{ width: `${Math.max(2, ((Number(f.bytes) || 0) / max) * 100)}%` }}
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Large screens only: two rows of three cards (phones and tablets get the summary card).
const STAT_GRID = `hidden lg:grid lg:grid-cols-3 ${GRID_GAP}`;

/**
 * `/admin` — deployment-wide numbers at a glance (GET /admin/overview): six `StatCard`s on large
 * screens (each with a related number as its sub-line), one three-part `SummaryPanel` below `lg`;
 * then storage by family and the latest activity.
 */
export default function AdminOverview() {
  const { t } = useTranslation('admin');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.overview });

  if (error) return <ErrorBlock error={error} onRetry={refetch} />;

  const c = data?.counts || {};
  const n = (key) => formatCount(c[key]);
  const storage = formatBytes(data?.storage?.totalBytes);

  // Large screens: six cards, each a number with one related number under it.
  const stats = [
    {
      key: 'people', icon: Users, tone: 'blue', to: '/admin/users', value: n('users'), label: t('overview.counts.users', 'People'),
      sub: { strong: n('activeUsers30d'), muted: t('overview.sub.active30d', 'active in the last 30 days') },
    },
    {
      key: 'invites', icon: MailPlus, tone: 'orange', to: '/admin/users', value: n('invitesPending'), label: t('overview.counts.invitesPending', 'Invites waiting'),
      sub: { strong: formatCount(data?.signups?.last30d), muted: t('overview.sub.signups30dNew', 'new sign-ups in 30 days') },
    },
    {
      key: 'families', icon: House, tone: 'green', to: '/admin/families', value: n('families'), label: t('overview.counts.families', 'Families'),
      sub: { strong: storage, muted: t('overview.sub.storageUsed', 'storage used') },
    },
    {
      key: 'documents', icon: FileText, tone: 'neutral', value: n('documents'), label: t('overview.counts.documents', 'Documents'),
      sub: { strong: n('files'), muted: t('overview.sub.filesShort', 'files') },
    },
    {
      key: 'passwords', icon: KeyRound, tone: 'sky', value: n('passwords'), label: t('overview.counts.passwords', 'Passwords'),
      sub: { strong: n('notes'), muted: t('overview.sub.notes', 'notes') },
    },
    {
      key: 'shares', icon: Link2, tone: 'violet', to: '/admin/shares', value: n('sharesActive'), label: t('overview.counts.activeShareLinks', 'Active share links'),
      sub: { strong: n('sharesTotal'), muted: t('overview.sub.sharesTotal', 'made in total') },
    },
  ];

  // Phones and tablets: one summary card with three sections.
  const sections = [
    {
      key: 'people', title: t('overview.cards.people', 'People'), total: n('users'), tone: 'primary',
      rows: [
        { key: 'active', icon: Activity, label: t('overview.rows.active30d', 'Active in 30 days'), value: n('activeUsers30d'), to: '/admin/users' },
        { key: 'invites', icon: MailPlus, label: t('overview.counts.invitesPending', 'Invites waiting'), value: n('invitesPending') },
        { key: 'signups', icon: UserPlus, label: t('overview.rows.signups30d', 'New in 30 days'), value: formatCount(data?.signups?.last30d) },
        { key: 'disabled', icon: UserX, label: t('overview.rows.disabled', 'Turned off'), value: n('disabledUsers') },
      ],
    },
    {
      key: 'content', title: t('overview.cards.content', 'Content'), total: n('documents'), tone: 'sky',
      rows: [
        { key: 'files', icon: Files, label: t('overview.rows.files', 'Files'), value: n('files') },
        { key: 'passwords', icon: KeyRound, label: t('overview.counts.passwords', 'Passwords'), value: n('passwords') },
        { key: 'notes', icon: StickyNote, label: t('overview.rows.notes', 'Notes'), value: n('notes') },
        { key: 'folders', icon: Folder, label: t('overview.counts.folders', 'Folders'), value: n('folders') },
      ],
    },
    {
      key: 'sharing', title: t('overview.cards.sharing', 'Sharing & storage'), total: storage, tone: 'green',
      rows: [
        { key: 'families', icon: House, label: t('overview.counts.families', 'Families'), value: n('families'), to: '/admin/families' },
        { key: 'active-links', icon: Link2, label: t('overview.counts.sharesActive', 'Active links'), value: n('sharesActive'), to: '/admin/shares' },
        { key: 'links-total', icon: Link2, label: t('overview.rows.sharesTotal', 'Links made'), value: n('sharesTotal') },
      ],
    },
  ];

  return (
    <div className={SECTION_GAP}>
      <section aria-label={t('overview.label', 'Numbers at a glance')}>
        <SummaryPanel stacked className="lg:hidden" loading={isLoading} sections={sections} />
        <div className={STAT_GRID}>
          {stats.map(({ key, ...stat }) => (
            <StatCard key={key} className="min-w-0" loading={isLoading} {...stat} />
          ))}
        </div>
      </section>

      <div className={`grid items-start lg:grid-cols-2 ${GRID_GAP}`}>
        <Section title={t('overview.storage.topFamilies', 'Families using the most space')}>
          {isLoading ? (
            <div className="space-y-4" aria-hidden="true">
              {[70, 55, 40].map((w) => (
                <div key={w}>
                  <Skeleton variant="line" height={14} width={`${w}%`} />
                  <Skeleton height={8} width="100%" rounded="full" className="mt-2" />
                </div>
              ))}
            </div>
          ) : (
            <TopFamilies families={data?.storage?.topFamilies} />
          )}
        </Section>

        <Section
          title={t('overview.recent.title', 'Recent activity')}
          bodyClassName="px-4 sm:px-5"
          action={
            <Link to="/admin/activity" className={`inline-flex min-h-11 shrink-0 items-center text-sm ${TEXT_LINK}`}>
              {t('overview.recent.viewAll', 'See all')}
            </Link>
          }
        >
          {isLoading ? <LoadingState compact className="py-4" /> : <AdminActivityList items={data?.recentActivity} />}
        </Section>
      </div>
    </div>
  );
}
