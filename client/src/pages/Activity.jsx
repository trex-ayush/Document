import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import { ListCard } from '@/components/ui/ListRow.jsx';
import { ErrorState } from '@/components/ui/PageState.jsx';
import { SkeletonRows } from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { activityApi } from '@/services/activityApi.js';
import { membersApi } from '@/services/membersApi.js';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll.js';
import ActivityFilters from '@/features/activity/ActivityFilters.jsx';
import ActivityRow from '@/features/activity/ActivityRow.jsx';
import { History } from 'lucide-react';

/**
 * Activity page (`/activity`) — global audit log, `GET /activity`
 * (docs/API.md, cursor pagination). Admin or write access only (server
 * enforces this too) — a read-only member landing here (deep link, stale
 * bookmark) sees a 403-style empty state instead of a broken/empty request
 * loop.
 */
export default function Activity() {
  const { t } = useTranslation('activity');
  const { membership } = useAuth();
  const allowed = membership?.role === 'admin' || membership?.access === 'write';

  const [filters, setFilters] = useState({ memberId: '', action: '', from: '', to: '' });

  const { data: membersData } = useQuery({
    queryKey: ['members'],
    queryFn: () => membersApi.list(),
    enabled: allowed,
  });
  const members = membersData?.items || [];

  const queryParams = useMemo(() => {
    const p = {};
    if (filters.memberId) p.memberId = filters.memberId;
    if (filters.action) p.action = filters.action;
    if (filters.from) p.from = filters.from;
    if (filters.to) p.to = filters.to;
    return p;
  }, [filters]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey: ['activity', queryParams],
    queryFn: ({ pageParam }) => activityApi.list({ ...queryParams, cursor: pageParam || undefined, limit: 30 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: allowed,
  });

  const sentinelRef = useInfiniteScroll(
    () => {
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    },
    { enabled: allowed && hasNextPage },
  );

  const items = data?.pages.flatMap((p) => p.items) || [];

  if (!allowed) {
    return (
      <PageContainer>
        <PageHeader title={t('page.title', 'Activity')} />
        <EmptyState
          icon={<History strokeWidth={1.5} />}
          title={t('noAccess.title', "You don't have access to this page")}
          description={t(
            'noAccess.description',
            'The activity log is only available to admins and members with write access. Ask your family admin if you need it.',
          )}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('page.title', 'Activity')}
        subtitle={t('page.subtitle', "Everything that's happened across your family's vault")}
      />

      <div className="mb-4 sm:mb-6">
        <ActivityFilters members={members} value={filters} onChange={setFilters} />
      </div>

      {isLoading ? (
        <SkeletonRows count={5} avatar />
      ) : isError ? (
        <ErrorState>{t('loadError', 'Could not load the activity log.')}</ErrorState>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<History strokeWidth={1.5} />}
          title={t('empty.title', 'No activity yet')}
          description={t('empty.description', 'Actions taken in your vault will show up here.')}
        />
      ) : (
        <>
          <ListCard>
            {items.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </ListCard>
          <div ref={sentinelRef} />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
          )}
          {!hasNextPage && items.length > 0 && (
            <p className="py-4 text-center text-xs text-neutral-500 dark:text-neutral-400">{t('endOfList', "You've reached the end.")}</p>
          )}
        </>
      )}
    </PageContainer>
  );
}
