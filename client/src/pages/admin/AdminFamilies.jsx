import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, House } from 'lucide-react';
import Badge from '@/components/ui/Badge.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { ListCard, ListIcon, ListRow } from '@/components/ui/ListRow.jsx';
import FilterBar from '@/components/ui/FilterBar.jsx';
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

/** The family's numbers in the details drawer: small bordered tiles, 2 per row on phones, 4 from sm. */
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
        <div key={key} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900/40">
          <p className="text-lg font-bold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">{value}</p>
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
        <LoadingBlock rows={4} avatar={false} />
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
  const [limit, setLimit] = useState(LIMIT);
  const debouncedQ = useDebouncedValue(q.trim(), 300);

  useEffect(() => setPage(1), [debouncedQ, limit]);

  const setOpenId = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('open', id);
    else next.delete('open');
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'families', { q: debouncedQ, page, limit }],
    queryFn: () => adminApi.listFamilies({ q: debouncedQ, page, limit }),
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
      <FilterBar
        className="mb-4 sm:mb-6"
        search={q}
        onSearchChange={setQ}
        searchPlaceholder={t('families.searchPlaceholder', 'Search by family name')}
      />

      {isLoading ? (
        <LoadingBlock avatar={false} />
      ) : error ? (
        <ErrorBlock error={error} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon={<House />} title={t('families.empty', 'No families found')} />
      ) : (
        <>
          {/* Phones and tablets: the app's list rows; tap one for details. */}
          <ListCard as="ul" className="lg:hidden">
            {items.map((f) => (
              <ListRow
                key={f.id}
                as="li"
                onClick={() => setOpenId(f.id)}
                icon={<ListIcon icon={House} kind="folder" />}
                title={f.name}
                meta={summary(f)}
                snippet={f.owner ? f.owner.name || f.owner.email : null}
                actions={<ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden="true" />}
              />
            ))}
          </ListCard>

          <div className="hidden lg:block">
            <Table columns={columns} rows={items} rowKey={(f) => f.id} onRowClick={(f) => setOpenId(f.id)} compact className="rounded-xl" />
          </div>
        </>
      )}

      <Pagination page={page} limit={limit} total={data?.total} onPageChange={setPage} onLimitChange={setLimit} disabled={isFetching} />

      <FamilyDrawer familyId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
