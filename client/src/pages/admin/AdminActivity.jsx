import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import Avatar from '@/components/ui/Avatar.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import FilterBar from '@/components/ui/FilterBar.jsx';
import LoadMore from '@/components/ui/LoadMore.jsx';
import { ListCard, ListRow } from '@/components/ui/ListRow.jsx';
import { ErrorState, LoadingState } from '@/components/ui/PageState.jsx';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { ACTION_LABELS, continuationForAction, labelForAction } from '@/features/activity/actionLabels.js';
import { formatDateTime, formatRelativeTime } from '@/i18n/formatters.js';
import { adminOpsApi } from '@/services/adminOpsApi.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

const EMPTY_FILTERS = { familyId: '', email: '', action: '', from: '', to: '' };
const PAGE_SIZE = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Admin > Activity (`/admin/activity`) — the activity log of every family on this deployment,
 * `GET /admin/activity` (docs/ADMIN_API.md, cursor pagination, "Load more"). Filters: family,
 * a person's email (looked up to a user id through `GET /admin/users`), action type and a date
 * range, in the shared FilterBar (on phones: a bottom sheet behind a "Filters" button).
 */
export default function AdminActivity() {
  const { t, i18n } = useTranslation(['adminOps', 'activity', 'common']);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const { data: familiesData } = useQuery({
    queryKey: ['admin-ops', 'family-options'],
    queryFn: () => adminOpsApi.families({ limit: 100 }),
    staleTime: 5 * 60_000,
  });
  const families = useMemo(
    () => [...(familiesData?.items || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [familiesData],
  );

  // A typed email becomes a `userId` filter once it is a full address that matches an account.
  const email = useDebouncedValue(filters.email.trim().toLowerCase(), 400);
  const emailComplete = EMAIL_RE.test(email);
  const userLookup = useQuery({
    queryKey: ['admin-ops', 'user-by-email', email],
    queryFn: () => adminOpsApi.users({ q: email, limit: 10 }),
    enabled: emailComplete,
    staleTime: 60_000,
  });
  const matchedUser = emailComplete
    ? (userLookup.data?.items || []).find((u) => (u.email || '').toLowerCase() === email)
    : null;
  const emailWaiting = emailComplete && userLookup.isLoading;
  const emailNotFound = emailComplete && !userLookup.isLoading && !userLookup.isError && !matchedUser;
  const emailHint = filters.email.trim() && !EMAIL_RE.test(filters.email.trim())
    ? t('activity.emailHint', 'Type the full email address')
    : null;

  const queryParams = useMemo(
    () => ({
      familyId: filters.familyId,
      userId: matchedUser?.id || '',
      action: filters.action,
      from: filters.from,
      to: filters.to,
    }),
    [filters.familyId, filters.action, filters.from, filters.to, matchedUser?.id],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey: ['admin-ops', 'activity', queryParams],
    queryFn: ({ pageParam }) => adminOpsApi.activity({ ...queryParams, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
    enabled: !emailWaiting && !emailNotFound,
  });
  const items = data?.pages.flatMap((p) => p.items || []) || [];

  const activeCount = ['familyId', 'email', 'action', 'from', 'to'].filter((k) => String(filters[k]).trim() !== '').length;

  const actionOptions = Object.keys(ACTION_LABELS)
    .map((code) => ({ value: code, label: labelForAction(code, t) }))
    .sort((a, b) => a.label.localeCompare(b.label, i18n.language));

  const filterDefs = [
    {
      key: 'familyId',
      label: t('activity.familyLabel', 'Family'),
      type: 'select',
      allLabel: t('activity.allFamilies', 'All families'),
      options: families.map((f) => ({ value: f.id, label: f.name })),
    },
    {
      key: 'email',
      label: t('activity.emailLabel', "Person's email"),
      type: 'text',
      inputType: 'email',
      inputMode: 'email',
      placeholder: t('activity.emailPlaceholder', 'Anyone — or type an email'),
      hint: emailHint,
    },
    {
      key: 'action',
      label: t('activity.actionLabel', 'What they did'),
      type: 'select',
      allLabel: t('activity.allActions', 'Anything'),
      options: actionOptions,
    },
    { key: 'from', label: t('activity.fromLabel', 'From date'), type: 'date' },
    { key: 'to', label: t('activity.toLabel', 'To date'), type: 'date' },
  ];

  let body;
  if (emailNotFound) {
    body = (
      <EmptyState
        icon={<History strokeWidth={1.5} />}
        title={t('activity.noUserTitle', 'No account uses this email')}
        description={t('activity.noUserDescription', 'Check the spelling, or clear the email filter to see everyone.')}
      />
    );
  } else if (isLoading || emailWaiting) {
    body = <LoadingState />;
  } else if (isError) {
    body = <ErrorState>{t('activity.loadError', 'Could not load the activity log.')}</ErrorState>;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={<History strokeWidth={1.5} />}
        title={activeCount ? t('activity.emptyFilteredTitle', 'Nothing matches these filters') : t('activity.emptyTitle', 'No activity yet')}
        description={
          activeCount
            ? t('activity.emptyFilteredDescription', 'Try a wider date range or clear a filter.')
            : t('activity.emptyDescription', 'What people do in their family vaults will show up here.')
        }
      />
    );
  } else {
    body = (
      <>
        <ListCard columns>
          {items.map((row) => (
            <AdminActivityRow key={row.id} row={row} />
          ))}
        </ListCard>
        <LoadMore
          hasMore={hasNextPage}
          loading={isFetchingNextPage}
          onLoadMore={fetchNextPage}
          shown={items.length}
          endText={t('activity.endOfList', "That's everything.")}
        />
      </>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {t('activity.subtitle', 'Everything people have done, across every family')}
      </p>

      <FilterBar filters={filterDefs} values={filters} onChange={setFilters} />

      <div>{body}</div>
    </div>
  );
}

/** "Ayush uploaded a document" / "“Aadhaar” · in Hemlata Family" / "2 hours ago". */
function AdminActivityRow({ row }) {
  const { t } = useTranslation(['adminOps', 'activity']);
  const name = row.actor?.name || row.actor?.email || t('activity.someone', 'Someone');
  const isAdminAction = (row.action || '').startsWith('admin.');
  const what = isAdminAction
    ? t('activity.adminAction', 'made an admin change ({{what}})', {
        what: row.action.slice('admin.'.length).replace(/[._]/g, ' '),
      })
    : continuationForAction(row.action, t);

  const meta = [
    row.targetTitle ? `“${row.targetTitle}”` : null,
    row.family?.name ? t('activity.inFamily', 'in {{family}}', { family: row.family.name }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      icon={<Avatar user={{ name }} size="md" />}
      wrapTitle
      title={
        <span>
          <Tooltip content={row.actor?.email || null} className="inline">
            <span>{name}</span>
          </Tooltip>{' '}
          <span className="font-normal text-neutral-600 dark:text-neutral-400">{what}</span>
        </span>
      }
      meta={meta || null}
      actions={
        <Tooltip content={formatDateTime(row.at)} position="left">
          <time dateTime={row.at} className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
            {formatRelativeTime(row.at)}
          </time>
        </Tooltip>
      }
    />
  );
}
