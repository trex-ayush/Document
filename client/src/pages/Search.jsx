import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/ui/PageHeader.jsx';
import SearchInput from '@/components/ui/SearchInput.jsx';
import Button from '@/components/ui/Button.jsx';
import Skeleton from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import { useIsMobile } from '@/hooks/useIsMobile.js';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { useDocumentsList } from '@/features/documents/documentsHooks.js';
import DocumentCard from '@/features/documents/DocumentCard.jsx';
import ItemCard from '@/features/items/ItemCard.jsx';
import SearchFilters from '@/features/search/SearchFilters.jsx';

/**
 * Global search page — the destination for both the Navbar's search trigger
 * (desktop) and the mobile bottom-tab-bar's Search tab (docs/UI_KIT.md
 * §7.2/§7.4). `GET /documents?q=` merges in `itemResults` (docs/API.md),
 * rendered via the Items module's `ItemCard`, tagged as items.
 */
export default function Search() {
  const { t } = useTranslation('search');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debouncedQ = useDebouncedValue(q, 300);

  const params = { q: debouncedQ || undefined, ...filters, page, limit: 24 };
  const hasQuery = Boolean(debouncedQ.trim()) || Object.values(filters).some(Boolean);
  const { data, isLoading, isFetching } = useDocumentsList(params, { enabled: hasQuery });

  const documents = data?.items || [];
  const items = data?.itemResults || [];
  const totalPages = data?.totalPages || 1;

  const updateFilters = (next) => {
    setFilters(next);
    setPage(1);
  };

  const filterPanel = <SearchFilters filters={filters} onChange={updateFilters} />;

  return (
    <div className="mx-auto max-w-6xl p-4 pb-24 sm:p-6">
      <PageHeader title={t('page.title', 'Search')} subtitle={t('page.subtitle', 'Documents, and vault items once matched')} />

      <div className="mt-4 flex gap-2">
        <SearchInput
          size="md"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder={t('page.searchPlaceholder', 'Search by title, tag, notes…')}
          wrapperClassName="flex-1"
        />
        {isMobile && (
          <Button variant="secondary" onClick={() => setFiltersOpen(true)}>{t('page.filtersButton', 'Filters')}</Button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        {!isMobile && <aside>{filterPanel}</aside>}

        <div>
          {!hasQuery && (
            <EmptyState title={t('page.emptyPrompt.title', 'Search your vault')} description={t('page.emptyPrompt.description', 'Type to search documents by title, tag, or notes — or use a filter.')} />
          )}

          {hasQuery && isLoading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={160} rounded="lg" />)}
            </div>
          )}

          {hasQuery && !isLoading && documents.length === 0 && items.length === 0 && (
            <EmptyState image="/assets/empty-documents.png" title={t('page.noResults.title', 'Nothing matches that')} description={t('page.noResults.description', 'Check the spelling, try a shorter word, or clear a filter.')} />
          )}

          {items.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">{t('page.vaultItems', 'Vault items')}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {items.map((item) => (
                  <div key={item.id} onClick={() => navigate(`/items/${item.id}`)} className="cursor-pointer">
                    <ItemCard item={item} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {documents.length > 0 && (
            <>
              <p className="mb-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">{t('page.documents', 'Documents')}</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {documents.map((doc) => (
                  <DocumentCard key={doc.id} doc={doc} onOpen={(d) => navigate(`/document/${d.id}`)} />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-3">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('page.previous', 'Previous')}</Button>
                  <span className="text-sm text-neutral-500">{t('page.pageOf', 'Page {{page}} of {{totalPages}}', { page, totalPages })}</span>
                  <Button variant="secondary" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>{t('page.next', 'Next')}</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Drawer isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} side="bottom" size="lg" title={t('page.filtersDrawerTitle', 'Filters')}>
        {filterPanel}
      </Drawer>
    </div>
  );
}
