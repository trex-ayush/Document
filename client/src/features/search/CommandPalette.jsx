import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import SearchInput from '@/components/ui/SearchInput.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import ItemCard from '@/features/items/ItemCard.jsx';
import { filesApi } from '@/services/filesApi.js';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { useDocumentsList } from '@/features/documents/documentsHooks.js';

/**
 * Ctrl+K / Cmd+K global search palette (desktop). Mounted from this agent's
 * own pages (Browse, Document detail, Search) — see this agent's final
 * report ("Search" section) for why it isn't mounted at the true app root
 * (AppShell/main.jsx are outside this agent's ownership) and the one-line
 * change requested from the lead to make it available everywhere.
 *
 * `GET /documents?q=` (docs/API.md) already merges in `itemResults` (vault
 * items matching the query) — rendered here via the Items module's own
 * `ItemCard` stub, tagged so they're visually distinct from documents.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const debouncedQuery = useDebouncedValue(query, 250);

  useEffect(() => {
    const onKeyDown = (e) => {
      const isK = e.key === 'k' || e.key === 'K';
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const { data, isFetching } = useDocumentsList(
    { q: debouncedQuery, limit: 8 },
    { enabled: open && debouncedQuery.trim().length > 0 },
  );

  const documents = data?.items || [];
  const items = data?.itemResults || [];
  const results = [
    ...documents.map((d) => ({ kind: 'document', data: d })),
    ...items.map((i) => ({ kind: 'item', data: i })),
  ];

  const go = (result) => {
    setOpen(false);
    if (result.kind === 'document') navigate(`/document/${result.data.id}`);
    else navigate(`/items/${result.data.id}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      go(results[activeIndex]);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 pt-[10vh] backdrop-blur-[1px]" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        className="mx-4 w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-800"
      >
        <div className="border-b border-neutral-100 p-3 dark:border-neutral-700">
          <SearchInput
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documents, items…"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {isFetching && (
            <div className="flex justify-center py-6"><Spinner size="sm" /></div>
          )}
          {!isFetching && debouncedQuery.trim() && results.length === 0 && (
            <p className="p-4 text-center text-sm text-neutral-400">No results for "{debouncedQuery}"</p>
          )}
          {!isFetching && results.map((r, i) => (
            <button
              key={`${r.kind}-${r.data.id}`}
              type="button"
              onClick={() => go(r)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full items-center gap-3 rounded-lg p-2 text-left ${i === activeIndex ? 'bg-neutral-100 dark:bg-neutral-700' : ''}`}
            >
              {r.kind === 'document' ? (
                <>
                  <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-700">
                    {r.data.primaryThumbUrl && <img src={filesApi.resolveUrl(r.data.primaryThumbUrl)} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{r.data.title}</p>
                    <p className="text-xs text-neutral-400">Document</p>
                  </div>
                </>
              ) : (
                <div className="min-w-0 flex-1">
                  <ItemCard item={r.data} />
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2 text-xs text-neutral-400 dark:border-neutral-700">
          <span>↑↓ to navigate · Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
