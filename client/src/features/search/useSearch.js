import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { search } from '@/services/searchApi.js';

/**
 * Debounced search (`GET /search`). Returns `{ data, isFetching, isError, query }` where
 * `query` is the trimmed, debounced text the current `data` belongs to. Nothing is fetched
 * while the box is empty.
 */
export function useSearch(q, { folderId, limit = 20, delay = 250 } = {}) {
  const debounced = useDebouncedValue((q || '').trim(), delay);
  const enabled = debounced.length > 0;
  const result = useQuery({
    queryKey: ['search', { q: debounced, folderId: folderId || null, limit }],
    queryFn: ({ signal }) => search({ q: debounced, folderId, limit }, { signal }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  return {
    data: enabled ? result.data : undefined,
    isFetching: enabled && result.isFetching,
    isError: enabled && result.isError,
    query: debounced,
    // True while the typed text hasn't been searched yet (debounce pending).
    isPending: (q || '').trim() !== debounced || (enabled && result.isFetching),
  };
}

export default useSearch;
