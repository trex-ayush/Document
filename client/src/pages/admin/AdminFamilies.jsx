import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, House } from 'lucide-react';
import Avatar from '@/components/ui/Avatar.jsx';
import Badge from '@/components/ui/Badge.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import SearchInput from '@/components/ui/SearchInput.jsx';
import Table from '@/components/ui/Table.jsx';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { formatDate, formatRelativeTime } from '@/i18n/formatters.js';
import { adminApi } from '@/services/adminApi.js';
import { AdminActivityList, DetailRow, DrawerHeading, ErrorBlock, LoadingBlock, Pagination, formatBytes, formatCount } from './adminShared.jsx';

const LIMIT = 20;

const STATUS_TONE = { active: 'green', invited: 'yellow', disabled: 'red' };

function countLabel(t, key, n, one, other) {
  return t(key, { count: Number(n) || 0, defaultValue: Number(n) === 1 ? one : other });
}

function FamilyStats({ family }) {
  const { t } = useTranslation('admin');
  const stats = [
    ['members', 'Members', formatCount(family.members)],
    ['documents', 'Documents', formatCount(family.documents)],
    ['files', 'Files', formatCount(family.files)],
    ['passwords', 'Passwords', formatCount(family.passwords)],
    ['notes', 'Notes', formatCount(family.notes)],
    ['folders', 'Folders', formatCount(family.folders)],
    ['storage', 'Storage', formatBytes(family.storageBytes)],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.map(([key, label, value]) => (
        <div key={key} className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <p className="text-base font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{t(`families.stats.${key}`, label)}</p>
        </div>
      ))}
    </div>
  );
}

function MemberBadges({ m }) {
  const { t } = useTranslation('admin');
  return (
    <span className="flex flex-wrap gap-1.5">
      <Badge tone={m.role === 'admin' ? 'purple' : 'gray'}>{t(`roles.${m.role}`, m.role || '')}</Badge>
      {m.access && <Badge tone="blue">{t(`access.${m.access}`, m.access)}</Badge>}
      {m.status && <Badge tone={STATUS_TONE[m.status] || 'gray'}>{t(`families.memberStatus.${m.status}`, m.status)}</Badge>}
    </span>
  );
}

function FamilyDrawer({ familyId, onClose }) {
  const { t } = useTranslation('admin');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'family', familyId],
    queryFn: () => adminApi.getFamily(familyId),
    enabled: Boolean(familyId),
  });
  const family = data?.family;
  const members = data?.members || [];

  const memberColumns = [
    {
      key: 'name',
      label: t('families.memberColumns.name', 'Name'),
      render: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{m.name}</p>
          {m.email && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{m.email}</p>}
        </div>
      ),
    },
    { key: 'role', label: t('families.memberColumns.role', 'Role'), render: (m) => <MemberBadges m={m} /> },
    { key: 'joinedAt', label: t('families.memberColumns.joined', 'Joined'), render: (m) => formatDate(m.joinedAt) },
  ];

  return (
    <Drawer isOpen={Boolean(familyId)} onClose={onClose} side="right" size="lg" title={family?.name || t('families.detail.title', 'Family details')}>
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={refetch} />
      ) : family ? (
        <div>
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-700">
            <DetailRow label={t('families.detail.owner', 'Owner')}>
              {family.owner ? (
                <>
                  <span className="block">{family.owner.name}</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">{family.owner.email}</span>
                </>
              ) : (
                '—'
              )}
            </DetailRow>
            <DetailRow label={t('families.detail.created', 'Created')}>{formatDate(family.createdAt)}</DetailRow>
            <DetailRow label={t('families.detail.lastActivity', 'Last activity')}>
              {family.lastActivityAt ? formatRelativeTime(family.lastActivityAt) : t('families.noActivity', 'No activity yet')}
            </DetailRow>
          </dl>

          <div className="mt-4">
            <FamilyStats family={family} />
          </div>

          <DrawerHeading>{t('families.detail.members', 'Members')}</DrawerHeading>
          {members.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('families.detail.membersEmpty', 'No members')}</p>
          ) : (
            <>
              <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 sm:hidden dark:divide-neutral-700 dark:border-neutral-700">
                {members.map((m) => (
                  <li key={m.id} className="px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{m.name}</p>
                    {m.email && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{m.email}</p>}
                    <div className="mt-1.5">
                      <MemberBadges m={m} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden sm:block">
                <Table columns={memberColumns} rows={members} rowKey={(m) => m.id} compact className="rounded-lg" />
              </div>
            </>
          )}

          <DrawerHeading>{t('families.detail.recentActivity', 'Recent activity')}</DrawerHeading>
          <AdminActivityList items={data?.recentActivity} showFamily={false} />
        </div>
      ) : null}
    </Drawer>
  );
}

/** `/admin/families` — every family on this deployment with its size; tap one for details. */
export default function AdminFamilies() {
  const { t } = useTranslation('admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebouncedValue(q.trim(), 300);

  useEffect(() => setPage(1), [debouncedQ]);

  const setOpenId = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('open', id);
    else next.delete('open');
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'families', { q: debouncedQ, page }],
    queryFn: () => adminApi.listFamilies({ q: debouncedQ, page, limit: LIMIT }),
    placeholderData: keepPreviousData,
  });
  const items = data?.items || [];

  const summary = (f) =>
    [
      countLabel(t, 'families.membersCount', f.members, '{{count}} member', '{{count}} members'),
      countLabel(t, 'families.documentsCount', f.documents, '{{count}} document', '{{count}} documents'),
      formatBytes(f.storageBytes),
    ].join(' · ');

  const columns = [
    {
      key: 'name',
      label: t('families.columns.name', 'Family'),
      render: (f) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{f.name}</p>
          {f.owner && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{f.owner.email || f.owner.name}</p>}
        </div>
      ),
    },
    { key: 'members', label: t('families.columns.members', 'Members'), align: 'right', render: (f) => formatCount(f.members) },
    { key: 'documents', label: t('families.columns.documents', 'Documents'), align: 'right', render: (f) => formatCount(f.documents) },
    { key: 'storageBytes', label: t('families.columns.storage', 'Storage'), align: 'right', render: (f) => formatBytes(f.storageBytes) },
    {
      key: 'lastActivityAt',
      label: t('families.columns.lastActivity', 'Last activity'),
      render: (f) => (f.lastActivityAt ? formatRelativeTime(f.lastActivityAt) : '—'),
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <SearchInput
          size="md"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('families.searchPlaceholder', 'Search by family name')}
          aria-label={t('families.searchPlaceholder', 'Search by family name')}
          wrapperClassName="w-full sm:max-w-sm"
          className="min-h-11 w-full"
        />
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={refetch} />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
          {t('families.empty', 'No families found')}
        </p>
      ) : (
        <>
          <ul className="space-y-2 lg:hidden">
            {items.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(f.id)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                    <House className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{f.name}</span>
                    <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{summary(f)}</span>
                    {f.owner && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <Avatar user={{ name: f.owner.name }} size="xs" />
                        <span className="truncate">{f.owner.name || f.owner.email}</span>
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden lg:block">
            <Table columns={columns} rows={items} rowKey={(f) => f.id} onRowClick={(f) => setOpenId(f.id)} compact className="rounded-xl" />
          </div>
        </>
      )}

      <Pagination page={page} limit={data?.limit || LIMIT} total={data?.total} onPageChange={setPage} disabled={isFetching} />

      <FamilyDrawer familyId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
