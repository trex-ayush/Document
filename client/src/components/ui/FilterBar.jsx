import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import Button from './Button.jsx';
import SearchableSelect, { EMPTY_MULTI, isMultiSet } from './SearchableSelect.jsx';
import SearchInput from './SearchInput.jsx';
import Tooltip from './Tooltip.jsx';
import { SEGMENT_TRACK, segmentItem } from './tokens.js';
import { formatDate } from '@/i18n/formatters.js';

/**
 * FilterBar — the search box and filters above a list, with the chosen filters shown as pills
 * ("Member: Asha ✕") and a "Clear all" link.
 *
 * Ported from the starter's filter row (the PM app's list filters): from `lg`, one white card
 * with every box in a row and a small label above each (Search, Status, …). Below `lg`, the
 * search box with a red filter button beside it (the app's main colour); the button opens the other filters in a card
 * under it, two to a row. Every dropdown is a SearchableSelect (a search box, an "All …" row,
 * then the options). A choice takes effect straight away.
 *
 * The caller owns the state: `values` is one object ({ memberId: '', action: '', … }) and
 * `onChange(next)` gets the whole next object.
 *
 * Filter types (`filters` array):
 *  - { key, label, type: 'select', options: [{ value, label, color? }], allLabel }  — pick one;
 *    `allLabel` is the "everything" row (the filter's empty value).
 *  - { key, label, type: 'multi', options, allLabel }  — tick several, with an Include / Exclude
 *    switch. Its value is { include: [], exclude: [] }; turn it into API params with
 *    `multiParams` from SearchableSelect.jsx.
 *  - { key, label, type: 'segment', options }  — a small segmented switch (Active / All; an
 *    option's optional `tip` shows as its tooltip). Always visible, on phones too, never a pill.
 *  - { key, label, type: 'date' }  — a date box; the pill reads "From: 3 Mar 2026".
 *  - { key, label, type: 'text', placeholder?, hint?, inputMode?, inputType? }
 *  Every filter may set `empty` (its "no filter" value; default '' or EMPTY_MULTI) and
 *  `pillLabel(value)`.
 *
 * Props: search?, onSearchChange?(text), searchPlaceholder?, filters, values, onChange(next),
 * onClearAll? (default: every filter back to empty and the search cleared), plain? (no card on
 * PC — for a bar that already sits inside a card), className?
 *
 * @example
 * <FilterBar search={q} onSearchChange={setQ} searchPlaceholder="Search the bin"
 *   filters={[{ key: 'type', label: 'Type', type: 'select', allLabel: 'Everything', options: TYPES }]}
 *   values={filters} onChange={setFilters} />
 */
const emptyOf = (f) => (f.empty !== undefined ? f.empty : f.type === 'multi' ? EMPTY_MULTI : '');
const isSet = (f, values) => {
  const v = values?.[f.key];
  if (f.type === 'multi') return isMultiSet(v);
  return v !== undefined && v !== null && String(v).trim() !== '' && v !== emptyOf(f);
};

function pillText(f, value, t) {
  if (f.pillLabel) return f.pillLabel(value);
  const name = (v) => (f.options || []).find((o) => o.value === v)?.label ?? v;
  if (f.type === 'multi') {
    const parts = [];
    if (value.include?.length) parts.push(value.include.map(name).join(', '));
    if (value.exclude?.length) parts.push(t('filters.notNames', 'not {{names}}', { names: value.exclude.map(name).join(', ') }));
    return `${f.label}: ${parts.join(' · ')}`;
  }
  if (f.type === 'date') return `${f.label}: ${formatDate(value)}`;
  if (f.type === 'text') return `${f.label}: ${value}`;
  return `${f.label}: ${name(value)}`;
}

/** The small label above each box. */
const SMALL_LABEL = 'mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400';
/** A typed box (date, text) — the same look as the dropdowns. */
const FILTER_INPUT =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500';

/** The heroicons "adjustments-horizontal" the starter's phone filter button uses. */
function FilterIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
      />
    </svg>
  );
}

/** One control for a filter. */
function FilterControl({ filter: f, value, onChange, id }) {
  if (f.type === 'multi' || f.type === 'select') {
    const multi = f.type === 'multi';
    const empty = emptyOf(f);
    return (
      <SearchableSelect
        id={id}
        multi={multi}
        // A single select's "all" is '' inside the dropdown, whatever the filter's empty value.
        value={multi ? value : value === empty ? '' : value}
        onChange={multi ? onChange : (v) => onChange(v === '' ? empty : v)}
        aria-label={f.label}
        allLabel={f.allLabel}
        options={f.options || []}
      />
    );
  }
  if (f.type === 'date') {
    return <input id={id} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={f.label} className={FILTER_INPUT} />;
  }
  return (
    <>
      <input
        id={id}
        type={f.inputType || 'text'}
        inputMode={f.inputMode}
        autoComplete="off"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={f.placeholder}
        aria-label={f.label}
        className={FILTER_INPUT}
      />
      {f.hint && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{f.hint}</p>}
    </>
  );
}

function Segment({ filter: f, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={f.label} className={`flex max-w-full overflow-x-auto ${SEGMENT_TRACK}`}>
      {(f.options || []).map((o) => {
        const active = o.value === value;
        // `tip` (optional) explains the choice in a few words on hover / keyboard focus.
        return (
          <Tooltip key={String(o.value)} content={o.tip} position="bottom" className="flex">
            <button
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={`min-h-9 whitespace-nowrap px-3 text-sm lg:min-h-7 ${segmentItem(active)}`}
            >
              {o.label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

export default function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters = [],
  values = {},
  onChange,
  onClearAll,
  plain = false,
  className = '',
}) {
  const { t } = useTranslation('common');
  const baseId = useId();
  const [panelOpen, setPanelOpen] = useState(false);

  const segments = filters.filter((f) => f.type === 'segment');
  const others = filters.filter((f) => f.type !== 'segment');
  const active = others.filter((f) => isSet(f, values));
  const hasSearch = typeof onSearchChange === 'function';
  const panelId = `${baseId}-panel`;

  const setOne = (key, value) => onChange({ ...values, [key]: value });
  const clearAll = () => {
    if (onClearAll) {
      onClearAll();
      return;
    }
    onChange({ ...values, ...Object.fromEntries(others.map((f) => [f.key, emptyOf(f)])) });
    if (hasSearch) onSearchChange('');
  };

  const filtersLabel = active.length
    ? t('filters.buttonCount', 'Filters ({{count}})', { count: active.length })
    : t('filters.button', 'Filters');
  const searchLabel = searchPlaceholder || t('search.placeholder', 'Search...');

  // Phone panel, two to a row: a typed box takes a whole row, and so does a box left without a
  // partner (the last one, or one just before a typed box) so no half row stays empty.
  const wideOnPhone = [];
  let col = 0;
  others.forEach((f, i) => {
    const next = others[i + 1];
    const wide = f.type === 'text' || (col === 0 && (!next || next.type === 'text'));
    wideOnPhone.push(wide);
    col = wide ? 0 : 1 - col;
  });

  const field = (f, prefix) => {
    const id = `${baseId}-${prefix}-${f.key}`;
    return (
      <>
        <label htmlFor={id} className={SMALL_LABEL}>
          {f.label}
        </label>
        <FilterControl filter={f} id={id} value={values[f.key] ?? emptyOf(f)} onChange={(v) => setOne(f.key, v)} />
      </>
    );
  };

  return (
    <div className={className}>
      {/* PC: one card, every box in a row with a small label above it. */}
      <div className={`hidden lg:block ${plain ? '' : 'rounded-lg bg-white p-2 shadow-sm sm:p-3 dark:bg-neutral-800'}`}>
        <div className="flex flex-wrap items-end gap-2 sm:gap-5">
          {hasSearch && (
            <div className="min-w-[180px] max-w-[240px]">
              <label htmlFor={`${baseId}-search`} className={SMALL_LABEL}>
                {t('filters.search', 'Search')}
              </label>
              <SearchInput
                id={`${baseId}-search`}
                size="filter"
                value={search ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchLabel}
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
          )}
          {others.map((f) => (
            <div key={f.key} className={`relative ${f.type === 'date' ? 'w-40' : f.type === 'text' ? 'w-56' : 'w-44 max-w-[14rem]'}`}>
              {field(f, 'pc')}
            </div>
          ))}
          {segments.map((f) => (
            <div key={f.key} className="min-w-0">
              {f.label && <span className={SMALL_LABEL}>{f.label}</span>}
              <Segment filter={f} value={values[f.key]} onChange={(v) => setOne(f.key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Phones and tablets: the search box, a red filter button, the filters in a card below. */}
      <div className="space-y-2 lg:hidden">
        {(hasSearch || others.length > 0) && (
          <div className="flex items-center gap-2">
            {hasSearch && (
              <SearchInput
                size="filterPhone"
                wrapperClassName="min-w-0 flex-1"
                value={search ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchLabel}
                autoComplete="off"
                enterKeyHint="search"
              />
            )}
            {others.length > 0 && (
              <Tooltip content={panelOpen ? t('filters.hide', 'Hide filters') : t('filters.show', 'Show filters')} className="flex flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setPanelOpen((o) => !o)}
                  aria-expanded={panelOpen}
                  aria-controls={panelId}
                  aria-label={hasSearch ? filtersLabel : undefined}
                  className={`relative flex flex-shrink-0 items-center gap-2 rounded-lg bg-primary-500 text-white shadow-sm transition-all hover:bg-primary-600 ${
                    hasSearch ? 'p-2' : 'px-3 py-2 text-sm font-medium'
                  }`}
                >
                  <FilterIcon />
                  {!hasSearch && filtersLabel}
                  {hasSearch && active.length > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-primary-600 ring-1 ring-primary-500">
                      {active.length}
                    </span>
                  )}
                </button>
              </Tooltip>
            )}
          </div>
        )}

        {others.length > 0 && panelOpen && (
          <div id={panelId} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
            <div className="grid grid-cols-2 gap-3">
              {others.map((f, i) => {
                const wide = wideOnPhone[i];
                return (
                  <div key={f.key} className={`relative min-w-0 ${wide ? 'col-span-2' : ''}`}>
                    {field(f, 'm')}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {segments.map((f) => (
          <Segment key={f.key} filter={f} value={values[f.key]} onChange={(v) => setOne(f.key, v)} />
        ))}
      </div>

      {active.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {active.map((f) => (
            <span
              key={f.key}
              className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full bg-neutral-100 py-0.5 pl-3 pr-1 text-xs text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
            >
              <span className="min-w-0 truncate">{pillText(f, values[f.key], t)}</span>
              <Tooltip content={t('filters.remove', 'Remove this filter')}>
                <button
                  type="button"
                  onClick={() => setOne(f.key, emptyOf(f))}
                  aria-label={t('filters.removeNamed', 'Remove {{name}}', { name: pillText(f, values[f.key], t) })}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-600 dark:hover:text-neutral-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </Tooltip>
            </span>
          ))}
          <Button variant="link" className="min-h-8 px-1 text-sm" onClick={clearAll}>
            {t('filters.clearAll', 'Clear all')}
          </Button>
        </div>
      )}
    </div>
  );
}

