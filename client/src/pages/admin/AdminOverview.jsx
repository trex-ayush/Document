import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminApi } from '@/services/adminApi.js';
import { AdminActivityList, ErrorBlock, LoadingBlock, Section, formatBytes, formatCount } from './adminShared.jsx';

// Every count GET /admin/overview returns, grouped the way a person reads them.
const GROUPS = [
  {
    key: 'people',
    title: 'People',
    counts: [
      ['users', 'People'],
      ['activeUsers30d', 'Active in last 30 days'],
      ['disabledUsers', 'Disabled accounts'],
      ['families', 'Families'],
      ['members', 'Family members'],
      ['invitesPending', 'Invites waiting'],
    ],
  },
  {
    key: 'saved',
    title: "What's saved",
    counts: [
      ['documents', 'Documents'],
      ['files', 'Files'],
      ['passwords', 'Passwords'],
      ['notes', 'Notes'],
      ['folders', 'Folders'],
    ],
  },
  {
    key: 'sharing',
    title: 'Share links',
    counts: [
      ['sharesActive', 'Active links'],
      ['sharesTotal', 'Links ever made'],
    ],
  },
];

function StatCard({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <p className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">{label}</p>
    </div>
  );
}

/** Horizontal bars, longest = full width. Each row links to that family's details. */
function TopFamilies({ families }) {
  const { t } = useTranslation('admin');
  if (!families?.length) {
    return <p className="py-2 text-sm text-neutral-500 dark:text-neutral-400">{t('overview.storage.empty', 'No files saved yet')}</p>;
  }
  const max = Math.max(...families.map((f) => Number(f.bytes) || 0), 1);
  return (
    <ul className="space-y-1">
      {families.map((f) => (
        <li key={f.id}>
          <Link
            to={`/admin/families?open=${encodeURIComponent(f.id)}`}
            className="block min-h-11 rounded-lg px-2 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-700/40"
          >
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-neutral-800 dark:text-neutral-200">{f.name}</span>
              <span className="shrink-0 tabular-nums text-neutral-500 dark:text-neutral-400">{formatBytes(f.bytes)}</span>
            </span>
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
              <span
                className="block h-full rounded-full bg-primary-500"
                style={{ width: `${Math.max(2, ((Number(f.bytes) || 0) / max) * 100)}%` }}
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** `/admin` — deployment-wide numbers at a glance (GET /admin/overview). */
export default function AdminOverview() {
  const { t } = useTranslation('admin');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.overview });

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} onRetry={refetch} />;

  const counts = data?.counts || {};
  return (
    <div className="space-y-6">
      {GROUPS.map((group) => (
        <section key={group.key}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">{t(`overview.groups.${group.key}`, group.title)}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {group.counts.map(([key, label]) => (
              <StatCard key={key} label={t(`overview.counts.${key}`, label)} value={formatCount(counts[key])} />
            ))}
          </div>
        </section>
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('overview.storage.title', 'Storage used')}>
          <p className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{formatBytes(data?.storage?.totalBytes)}</p>
          <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">{t('overview.storage.total', 'Across every family')}</p>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {t('overview.storage.topFamilies', 'Families using the most space')}
          </h3>
          <TopFamilies families={data?.storage?.topFamilies} />
        </Section>

        <Section title={t('overview.signups.title', 'New sign-ups')}>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={t('overview.signups.last7d', 'Last 7 days')} value={formatCount(data?.signups?.last7d)} />
            <StatCard label={t('overview.signups.last30d', 'Last 30 days')} value={formatCount(data?.signups?.last30d)} />
          </div>
        </Section>
      </div>

      <Section
        title={t('overview.recent.title', 'Recent activity')}
        bodyClassName="px-4"
        action={
          <Link
            to="/admin/activity"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            {t('overview.recent.viewAll', 'See all')}
          </Link>
        }
      >
        <AdminActivityList items={data?.recentActivity} />
      </Section>
    </div>
  );
}
