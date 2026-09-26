import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Minus, Search, X } from 'lucide-react';

/** The "nothing chosen" value of a multi select. */
export const EMPTY_MULTI = Object.freeze({ include: [], exclude: [] });

/** True when a multi select has anything ticked (included or excluded). */
export const isMultiSet = (v) => Boolean(v && ((v.include?.length ?? 0) > 0 || (v.exclude?.length ?? 0) > 0));

/**
 * A multi select's `{ include, exclude }` -> API params `{ [key]: 'a,b', [key + 'Not']: 'c' }`,
 * empty lists left out.
 * @example multiParams('memberId', filters.memberId) // { memberId: 'id1,id2' }
 */
export function multiParams(key, v) {
  const out = {};
  if (v?.include?.length) out[key] = v.include.join(',');
  if (v?.exclude?.length) out[`${key}Not`] = v.exclude.join(',');
  return out;
}

/** The closed box — same as the starter's filter dropdown button. */
export const FILTER_BOX =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-left text-sm text-neutral-800 transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:focus:ring-neutral-400';

/**
 * SearchableSelect — the filter dropdown: a search box on top, an "All …" row, then the options.
 * One choice (`multi` off) closes the list on pick. With `multi`, each option gets a tick box and
 * an Include / Exclude switch sits on top: in Include a tick means "only these" (blue ✓), in
 * Exclude "everything but these" (red −). Ticked options move to the top each time the list opens.
 * ↑ / ↓ move through the list, Enter picks, Esc closes.
 *
 * Ported from the starter's SearchableSelect (apps/component ptm/SearchableSelect.tsx). Changed
 * for this app: plain JS, lucide icons, en/hi text, an optional `color` dot per option, and no
 * autofocus of the search box on touch screens (it would pop the keyboard over the list).
 *
 * Props: options [{ value, label, color? }], value (multi: { include: [], exclude: [] }; single:
 * a value, '' = all), onChange(next), allLabel, multi?, disableExclude?, searchPlaceholder?,
 * id?, 'aria-label'?
 *
 * @example
 * <SearchableSelect multi aria-label="Member" allLabel="All members" value={v} onChange={setV}
 *   options={members.map((m) => ({ value: m.id, label: m.name }))} />
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  allLabel,
  multi = false,
  disableExclude = false,
  searchPlaceholder,
  id,
  'aria-label': ariaLabel,
}) {
  const { t } = useTranslation('common');
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('include');
  const [highlight, setHighlight] = useState(-1);
  const [frozen, setFrozen] = useState(() => new Set());
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const include = multi ? value?.include || [] : [];
  const exclude = multi ? value?.exclude || [] : [];
  const hasValue = multi ? include.length > 0 || exclude.length > 0 : value !== '' && value != null;
  const labelOf = (v) => options.find((o) => o.value === v)?.label ?? v;

  const close = () => {
    setOpen(false);
    setSearch('');
    setHighlight(-1);
  };

  // Snapshot what is ticked when the list opens, so a just-ticked row doesn't jump.
  useEffect(() => {
    if (!open) return;
    setFrozen(new Set([...include, ...exclude]));
    setMode(exclude.length > 0 && include.length === 0 ? 'exclude' : 'include');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // On a computer, put the cursor in the search box; on a phone that would cover the list.
  useEffect(() => {
    if (!open) return;
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!touch) searchRef.current?.focus();
  }, [open]);

  // Keep the panel on screen: open it to the left when it would run off the right edge.
  useLayoutEffect(() => {
    if (!open || !panelRef.current || !wrapRef.current) return;
    const panel = panelRef.current.getBoundingClientRect();
    setAlignRight(panel.right > window.innerWidth - 8 && wrapRef.current.getBoundingClientRect().right - panel.width >= 8);
  }, [open]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? options.filter((o) => String(o.label).toLowerCase().includes(q)) : options;
    if (!multi) return list;
    return [...list.filter((o) => frozen.has(o.value)), ...list.filter((o) => !frozen.has(o.value))];
  }, [options, search, frozen, multi]);

  useEffect(() => {
    setHighlight(shown.length === 1 ? 0 : -1);
  }, [search, shown.length]);

  useEffect(() => {
    if (highlight < 0 || !listRef.current) return;
    listRef.current.querySelectorAll('[data-option-item]')[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const pick = (v) => {
    if (!multi) {
      onChange(v);
      close();
      return;
    }
    if (mode === 'include') {
      onChange(
        include.includes(v)
          ? { include: include.filter((x) => x !== v), exclude }
          : { include: [...include, v], exclude: exclude.filter((x) => x !== v) },
      );
    } else {
      onChange(
        exclude.includes(v)
          ? { include, exclude: exclude.filter((x) => x !== v) }
          : { include: include.filter((x) => x !== v), exclude: [...exclude, v] },
      );
    }
  };

  const clear = () => {
    onChange(multi ? { include: [], exclude: [] } : '');
    close();
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => (i < shown.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => (i > 0 ? i - 1 : shown.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[highlight]) pick(shown[highlight].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  let display = allLabel;
  if (!multi) {
    if (hasValue) display = labelOf(value);
  } else if (include.length === 1 && exclude.length === 0) {
    display = labelOf(include[0]);
  } else if (exclude.length === 1 && include.length === 0) {
    display = t('select.notOne', 'Not {{name}}', { name: labelOf(exclude[0]) });
  } else if (hasValue) {
    display = [
      include.length ? t('select.includedCount', '{{count}} included', { count: include.length }) : null,
      exclude.length ? t('select.excludedCount', '{{count}} excluded', { count: exclude.length }) : null,
    ]
      .filter(Boolean)
      .join(', ');
  }

  const modeButton = (m) => {
    const active = mode === m;
    const on =
      m === 'include'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        title={m === 'include' ? t('select.tipInclude', 'Show only what you tick') : t('select.tipExclude', 'Hide what you tick')}
        onClick={() => setMode(m)}
        className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
          active ? on : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700'
        }`}
      >
        {m === 'include' ? t('select.include', 'Include') : t('select.exclude', 'Exclude')}
      </button>
    );
  };

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        id={id}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel ? `${ariaLabel}: ${display}` : undefined}
        className={FILTER_BOX}
      >
        <span className="flex items-center justify-between gap-1">
          <span className={`block min-w-0 flex-1 truncate ${hasValue ? '' : 'text-neutral-400 dark:text-neutral-500'}`}>{display}</span>
          {hasValue ? (
            // Inside the button, so not a button itself; the pill under the bar is the keyboard way to clear.
            <span
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              title={t('select.clear', 'Clear this')}
              aria-hidden="true"
              className="flex-shrink-0 cursor-pointer rounded p-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-600"
            >
              <X className="h-3.5 w-3.5 text-neutral-400" />
            </span>
          ) : (
            <ChevronDown
              className={`pointer-events-none h-3.5 w-3.5 flex-shrink-0 text-neutral-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          )}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className={`absolute z-[60] mt-1 w-64 max-w-[calc(100vw-2rem)] animate-fade-in rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 ${
            alignRight ? 'right-0' : 'left-0'
          }`}
        >
          {multi && !disableExclude && (
            <div role="radiogroup" aria-label={t('select.modeLabel', 'Include or exclude')} className="flex gap-1 px-2 pb-1.5">
              {modeButton('include')}
              {modeButton('exclude')}
            </div>
          )}

          <div className="px-2 pb-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder || t('select.searchPlaceholder', 'Search...')}
                aria-label={searchPlaceholder || t('select.searchPlaceholder', 'Search...')}
                autoComplete="off"
                className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-8 pr-3 text-sm placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500"
              />
            </div>
          </div>

          <div className="my-1 border-t border-neutral-100 dark:border-neutral-700" />

          <button
            type="button"
            onClick={clear}
            className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
              hasValue
                ? 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700'
                : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            }`}
          >
            {allLabel}
          </button>

          <div className="my-1 border-t border-neutral-100 dark:border-neutral-700" />

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-multiselectable={multi || undefined}
            aria-label={ariaLabel}
            className="max-h-48 overflow-y-auto overscroll-contain"
          >
            {shown.length === 0 ? (
              <p className="px-3 py-2 text-center text-sm text-neutral-500 dark:text-neutral-400">{t('select.noResults', 'Nothing found')}</p>
            ) : (
              shown.map((o, index) => {
                const state = multi
                  ? include.includes(o.value)
                    ? 'in'
                    : exclude.includes(o.value)
                      ? 'out'
                      : 'none'
                  : o.value === value
                    ? 'in'
                    : 'none';
                return (
                  <button
                    key={String(o.value)}
                    type="button"
                    role="option"
                    data-option-item
                    aria-selected={state !== 'none'}
                    onClick={() => pick(o.value)}
                    onMouseEnter={() => setHighlight(index)}
                    className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                      highlight === index
                        ? 'bg-neutral-100 dark:bg-neutral-600'
                        : state === 'in'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : state === 'out'
                            ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {multi && (
                        <span
                          aria-hidden="true"
                          className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
                            state === 'in'
                              ? 'border-blue-500 bg-blue-500'
                              : state === 'out'
                                ? 'border-red-500 bg-red-500'
                                : 'border-neutral-300 dark:border-neutral-500'
                          }`}
                        >
                          {state === 'in' && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                          {state === 'out' && <Minus className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        {o.color && <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: o.color }} aria-hidden="true" />}
                        <span className="truncate">{o.label}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
