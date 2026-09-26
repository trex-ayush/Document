import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import FilterBar from '@/components/ui/FilterBar.jsx';
import SearchInput from '@/components/ui/SearchInput.jsx';
import { SkeletonRows } from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { ErrorState } from '@/components/ui/PageState.jsx';
import SearchResultList from '@/features/search/SearchResultList.jsx';
import { flattenResults } from '@/features/search/searchResults.js';
import { useSearch } from '@/features/search/useSearch.js';

const PAGE_LIMIT = 50;
const GROUPS = ['all', 'folders', 'documents', 'items'];

/**
 * `/search?q=` — one box, results grouped Folders / Documents / Passwords & notes.
 * Searches everywhere in the family's vault (titles, notes, usernames, extra fields —
 * never passwords). The box is focused on open (the phone's Search tab lands here). Once
 * there are results, a switch narrows them to one group, each with its count.
 */
export default function Search() {
  const { t } = useTranslation('search');
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [value, setValue] = useState(urlQuery);
  const [group, setGroup] = useState('all');
  const inputRef = useRef(null);

  const { data, isPending, isError, query } = useSearch(value, { limit: PAGE_LIMIT });
  const allRows = useMemo(() => flattenResults(data), [data]);
  const rows = group === 'all' ? allRows : allRows.filter((r) => r.group === group);
  const hasText = value.trim().length > 0;

  const groupLabel = (g) =>
    g === 'all'
      ? t('page.all', 'All')
      : t(`groups.${g}`, { folders: 'Folders', documents: 'Documents', items: 'Passwords & notes' }[g]);
  const countOf = (g) => (g === 'all' ? allRows.length : allRows.filter((r) => r.group === g).length);
  // Only groups that found something, and only once there is more than one kind to pick from.
  const shownGroups = GROUPS.filter((g) => g === 'all' || countOf(g) > 0);
  const groupFilters =
    hasText && shownGroups.length > 2
      ? [
          {
            key: 'group',
            label: t('page.showLabel', 'Show'),
            type: 'segment',
            empty: 'all',
            options: shownGroups.map((g) => ({ value: g, label: `${groupLabel(g)} (${countOf(g)})` })),
          },
        ]
      : [];

  // A group that no longer has results falls back to All.
  useEffect(() => {
    if (group !== 'all' && data && !allRows.some((r) => r.group === group)) setGroup('all');
  }, [group, data, allRows]);

  // Follow the URL when it changes from outside (e.g. the navbar's "See all results").
  useEffect(() => {
    setValue((current) => (current.trim() === urlQuery.trim() ? current : urlQuery));
  }, [urlQuery]);

  // Keep the URL in step with what was searched, so Back and sharing the link work.
  useEffect(() => {
    if (query === urlQuery.trim()) return;
    setSearchParams(query ? { q: query } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <PageContainer>
      <PageHeader title={t('page.title', 'Search')} subtitle={t('page.subtitle', 'Find any folder, document, password or note')} />

      <SearchInput
        ref={inputRef}
        size="md"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('page.placeholder', 'Type a name, a word from notes, a username…')}
        aria-label={t('page.title', 'Search')}
        autoComplete="off"
        enterKeyHint="search"
      />

      {groupFilters.length > 0 && (
        <FilterBar
          plain
          className="mt-3"
          filters={groupFilters}
          values={{ group }}
          onChange={(next) => setGroup(next.group || 'all')}
        />
      )}

      <div className="mt-4 sm:mt-6" aria-live="polite">
        {!hasText ? (
          <EmptyState
            variant="plain"
            title={t('page.emptyPrompt.title', 'Search your vault')}
            description={t('page.emptyPrompt.description', 'Start typing — results appear as you type.')}
          />
        ) : rows.length > 0 ? (
          <SearchResultList rows={rows} query={query} />
        ) : isPending ? (
          <SkeletonRows count={4} />
        ) : isError ? (
          <ErrorState>{t('error', 'Search is not working right now. Please try again.')}</ErrorState>
        ) : (
          <EmptyState
            variant="plain"
            image="/assets/empty-documents.png"
            title={t('page.noResults.title', 'Nothing matches that')}
            description={t('page.noResults.description', 'Check the spelling or try a shorter word.')}
          />
        )}
      </div>
    </PageContainer>
  );
}
