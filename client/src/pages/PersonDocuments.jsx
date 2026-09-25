import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button.jsx';
import Skeleton from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ViewModeToggle from '@/components/ui/ViewModeToggle.jsx';
import { useLocalStorageState } from '@/hooks/useLocalStorageState.js';
import { useAuth } from '@/context/AuthContext.jsx';
import { documentsApi } from '@/services/documentsApi.js';
import { itemsApi } from '@/services/itemsApi.js';
import { useMembers } from '@/features/documents/documentsHooks.js';
import DocumentCard from '@/features/documents/DocumentCard.jsx';
import DocumentRow from '@/features/documents/DocumentRow.jsx';
import UploadModal from '@/features/documents/UploadModal.jsx';
import ItemCard from '@/features/items/ItemCard.jsx';
import PersonAvatar from '@/features/people/PersonAvatar.jsx';
import { SHARED_SLUG, isValidPersonSlug, toApiMemberId } from '@/features/people/peopleUtils.js';
import { ChevronLeft, Plus } from 'lucide-react';

const PAGE_SIZE = 30;

/**
 * `/people/:memberId` and `/people/shared` — the member-first home's second (and last) step:
 * one person's documents (or the family's shared ones) as a flat list, no folders to dig
 * through. Reuses Browse's DocumentCard/DocumentRow and its grid/list preference.
 */
export default function PersonDocuments() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { memberId: slug } = useParams();
  const navigate = useNavigate();
  const { membership } = useAuth();
  const [viewMode, setViewMode] = useLocalStorageState('family-vault-browse-view', 'grid');
  const [uploadOpen, setUploadOpen] = useState(false);

  const isShared = slug === SHARED_SLUG;
  const validSlug = isValidPersonSlug(slug);
  const apiMemberId = toApiMemberId(slug);

  const { data: membersData, isLoading: membersLoading } = useMembers();
  const member = isShared ? null : (membersData?.items || []).find((m) => m.id === slug);
  const notFound = !validSlug || (!isShared && !membersLoading && !member);
  const canWrite = membership?.role === 'admin' || membership?.access === 'write';

  const docsQuery = useInfiniteQuery({
    queryKey: ['documents', 'person', apiMemberId],
    queryFn: ({ pageParam }) => documentsApi.list({ memberId: apiMemberId, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: validSlug && !notFound,
  });

  const itemsQuery = useQuery({
    queryKey: ['items', 'person', apiMemberId],
    queryFn: () => itemsApi.list({ memberId: apiMemberId, limit: 50 }),
    enabled: validSlug && !notFound,
  });

  const documents = (docsQuery.data?.pages || []).flatMap((p) => p.items || []);
  const total = docsQuery.data?.pages?.[0]?.total ?? 0;
  const items = itemsQuery.data?.items || [];

  const title = isShared ? t('common:people.shared', 'Shared (whole family)') : member?.name || '';
  const subtitle = isShared
    ? t('person.sharedDescription', 'Documents for the whole family, not tied to one person')
    : member?.id === membership?.id
      ? t('common:people.you', 'You')
      : member?.relation || '';

  const openDoc = (doc) => navigate(`/document/${doc.id}`);

  const backLink = (
    <Link
      to="/"
      className="-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-neutral-600 hover:text-primary-600 dark:text-neutral-300 dark:hover:text-primary-400"
    >
      <ChevronLeft className="w-4 h-4" />
      {t('person.backHome', 'Home')}
    </Link>
  );

  if (notFound) {
    return (
      <div className="mx-auto max-w-6xl p-4 pb-24 sm:p-6">
        {backLink}
        <EmptyState
          className="mt-4"
          title={t('person.notFound.title', "We couldn't find this person")}
          description={t('person.notFound.description', 'They may have been removed from the family.')}
          action={<Button as={Link} to="/">{t('person.notFound.action', 'Go to home')}</Button>}
        />
      </div>
    );
  }

  const addButton = canWrite && (
    <Button onClick={() => setUploadOpen(true)} leftIcon={<Plus className="w-4 h-4" />} className="w-full sm:w-auto">
      {t('person.addDocument', 'Add document')}
    </Button>
  );

  return (
    <div className="mx-auto max-w-6xl p-4 pb-24 sm:p-6">
      {backLink}

      <div className="mt-2 mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {membersLoading && !isShared ? (
            <Skeleton width={64} height={64} rounded="full" />
          ) : (
            <PersonAvatar member={member} size="lg" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-neutral-900 dark:text-neutral-100 sm:text-2xl" title={title}>
              {title}
            </h1>
            {subtitle && <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
            {!docsQuery.isLoading && (
              <p className="text-xs text-neutral-400">{t('common:units.document', '{{count}} documents', { count: total })}</p>
            )}
          </div>
        </div>
        {addButton}
      </div>

      {docsQuery.isLoading ? (
        <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4' : 'space-y-1'}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={viewMode === 'grid' ? 140 : 56} rounded="lg" />)}
        </div>
      ) : docsQuery.isError ? (
        <EmptyState
          title={t('person.loadError', 'Could not load these documents.')}
          action={<Button variant="secondary" onClick={() => docsQuery.refetch()}>{t('common:actions.tryAgain', 'Try again')}</Button>}
        />
      ) : documents.length === 0 ? (
        <EmptyState
          image="/assets/empty-documents.png"
          title={
            isShared
              ? t('person.emptyShared.title', 'No shared documents yet')
              : t('person.empty.title', 'No documents for {{name}} yet', { name: title })
          }
          description={
            canWrite
              ? isShared
                ? t('person.emptyShared.description', 'Tap “Add document” to save one for the whole family.')
                : t('person.empty.description', 'Tap “Add document” to save {{name}}’s first one.', { name: title })
              : undefined
          }
          action={canWrite ? <Button onClick={() => setUploadOpen(true)}>{t('person.addDocument', 'Add document')}</Button> : undefined}
        />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{t('person.documents', 'Documents')}</h2>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {documents.map((d) => <DocumentCard key={d.id} doc={d} onOpen={openDoc} />)}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
              {documents.map((d) => <DocumentRow key={d.id} doc={d} onOpen={openDoc} />)}
            </div>
          )}
          {docsQuery.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" loading={docsQuery.isFetchingNextPage} onClick={() => docsQuery.fetchNextPage()}>
                {t('person.showMore', 'Show more')}
              </Button>
            </div>
          )}
        </>
      )}

      {items.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">{t('person.vaultItems', 'Passwords, numbers & notes')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {items.map((item) => <ItemCard key={item.id} item={item} />)}
          </div>
        </section>
      )}

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        mode="create"
        defaultMemberId={isShared ? '' : member?.id || ''}
        onCreated={(doc) => navigate(`/document/${doc.id}`)}
      />
    </div>
  );
}
