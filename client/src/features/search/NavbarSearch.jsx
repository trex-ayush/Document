import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Spinner from '@/components/ui/Spinner.jsx';
import { useClickOutside } from '@/hooks/useClickOutside.js';
import { Search, X } from 'lucide-react';
import SearchResultList from './SearchResultList.jsx';
import { flattenResults, searchPagePath } from './searchResults.js';
import { useSearch } from './useSearch.js';

const DROPDOWN_LIMIT = 8;

function isMacLike() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
}

/**
 * NavbarSearch — the always-visible search box in the top bar (PC/tablet). Live results
 * appear in a dropdown grouped Folders / Documents / Passwords & notes. Up/Down to move,
 * Enter to open (Enter with nothing highlighted opens the full /search page), Esc to close.
 * Ctrl+K (Cmd+K on Mac) focuses it from anywhere.
 */
export default function NavbarSearch({ className = '' }) {
  const { t } = useTranslation('search');
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();
  const shortcut = useMemo(() => (isMacLike() ? '⌘K' : 'Ctrl K'), []);

  const { data, isPending, isError, query } = useSearch(value, { limit: DROPDOWN_LIMIT });
  const rows = useMemo(() => flattenResults(data), [data]);
  const hasText = value.trim().length > 0;
  const showDropdown = open && hasText;

  useClickOutside(wrapperRef, () => setOpen(false), open);

  // Reset the highlight whenever a new set of results arrives.
  useEffect(() => {
    setActiveIndex(-1);
  }, [data]);

  // Ctrl/Cmd+K focuses the box from anywhere (or opens the search page if the box is hidden).
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const input = inputRef.current;
        if (input && input.offsetParent !== null) {
          input.focus();
          input.select();
          setOpen(true);
        } else {
          navigate('/search');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  const finish = (to) => {
    setOpen(false);
    setValue('');
    inputRef.current?.blur();
    navigate(to);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (rows.length) setActiveIndex((i) => (i + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length) setActiveIndex((i) => (i <= 0 ? rows.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!hasText) return;
      if (activeIndex >= 0 && rows[activeIndex]) finish(rows[activeIndex].to);
      else finish(searchPagePath(value));
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (value) {
        setValue('');
      } else {
        inputRef.current?.blur();
      }
    }
  };

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showDropdown && activeIndex >= 0 ? `${listId}-row-${activeIndex}` : undefined}
          aria-label={t('navbar.label', 'Search everything')}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t('navbar.placeholder', 'Search folders, documents, passwords…')}
          className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-16 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-primary-500 dark:focus:bg-neutral-900 dark:focus:ring-primary-900/40"
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {hasText ? (
            <button
              type="button"
              onClick={() => {
                setValue('');
                inputRef.current?.focus();
              }}
              aria-label={t('navbar.clear', 'Clear search')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-neutral-200 bg-white px-1.5 py-0.5 font-sans text-[11px] text-neutral-400 lg:inline-block dark:border-neutral-700 dark:bg-neutral-800">
              {shortcut}
            </kbd>
          )}
        </span>
      </div>

      {showDropdown && (
        <div
          id={listId}
          role="listbox"
          aria-label={t('navbar.resultsLabel', 'Search results')}
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-dropdown dark:border-neutral-700 dark:bg-neutral-800"
        >
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-1.5">
            {rows.length > 0 ? (
              <SearchResultList
                rows={rows}
                query={query}
                activeIndex={activeIndex}
                onHover={setActiveIndex}
                onSelect={() => {
                  // The row is a Link — it navigates itself; just tidy up the box.
                  setOpen(false);
                  setValue('');
                }}
                compact
                idPrefix={`${listId}-row`}
              />
            ) : isPending ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : isError ? (
              <p className="px-3 py-5 text-center text-sm text-red-600 dark:text-red-400">{t('error', 'Search is not working right now. Please try again.')}</p>
            ) : (
              <p className="px-3 py-5 text-center text-sm text-neutral-500 dark:text-neutral-400">
                {t('noResultsFor', 'Nothing found for “{{query}}”', { query: value.trim() })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => finish(searchPagePath(value))}
            className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-neutral-200 px-4 py-2.5 text-left text-sm font-medium text-primary-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-primary-400 dark:hover:bg-neutral-700/50"
          >
            <span className="truncate">{t('navbar.seeAll', 'See all results for “{{query}}”', { query: value.trim() })}</span>
            <span className="hidden flex-shrink-0 text-xs font-normal text-neutral-500 dark:text-neutral-400 sm:inline">{t('navbar.enterHint', 'Enter')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
