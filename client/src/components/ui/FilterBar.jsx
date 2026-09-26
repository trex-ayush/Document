import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, X } from 'lucide-react';
import Button from './Button.jsx';
import Input from './Input.jsx';
import SearchInput from './SearchInput.jsx';
import SelectMenu from './SelectMenu.jsx';
import Tooltip from './Tooltip.jsx';
import { SEGMENT_TRACK, segmentItem } from './tokens.js';
import { formatDate } from '@/i18n/formatters.js';

/**
 * FilterBar — the search box and filters above a list, with the chosen filters shown as pills
 * ("Member: Asha ✕") and a "Clear all" link.
 *
 * Ported from the starter's filter row (apps/component ptm/FilterBar.tsx: a card with labelled
 * filter fields and "Clear filters"; FilterChip for the dismissible pills; the template's
 * Bookmarks page for search + dropdown in one row). Changed for this app: our SearchInput,
 * SelectMenu, Input and Button; en/hi text. From `md` it is one card row: every box has a small
 * label above it (Search, Status, …). Below `md` the search box stays visible with a blue filter
 * button beside it; the button opens the other filters under the box, two to a row. A choice
 * takes effect straight away, on phones too.
 *
 * The caller owns the state: `values` is one object ({ memberId: '', action: '', … }) and
 * `onChange(next)` gets the whole next object.
 *
 * Filter types (`filters` array):
 *  - { key, label, type: 'select', options: [{ value, label }], allLabel? }  — `allLabel` adds
 *    the "everything" option first (its value is the filter's empty value).
 *  - { key, label, type: 'segment', options }  — a small segmented switch (Active / All; an option's
 *    optional `tip` shows as its tooltip), after
 *    the search box. Always visible, on phones too, never a pill.
 *  - { key, label, type: 'date' }  — a date box; the pill reads "From: 3 Mar 2026".
 *  - { key, label, type: 'text', placeholder?, hint?, inputMode? }
 *  Every filter may set `empty` (its "no filter" value, default '') and `pillLabel(value)`.
 *
 * Props: search?, onSearchChange?(text), searchPlaceholder?, searchRef?, filters, values, onChange(next),
 * onClearAll? (default: every filter back to empty and the search cleared), plain? (no card —
 * for a bar that already sits inside a card), className?
 *
 * @example
 * <FilterBar search={q} onSearchChange={setQ} searchPlaceholder="Search the bin"
 *   filters={[{ key: 'type', label: 'Type', type: 'select', allLabel: 'Everything', options: TYPES }]}
 *   values={filters} onChange={setFilters} />
 */
/** From `md` the bar is a card (phones: no card, so the search box sits flush with the page). */
const CARD_ON_PC =
  'md:rounded-xl md:border md:border-neutral-200 md:bg-white md:p-4 md:shadow-card dark:md:border-neutral-700 dark:md:bg-neutral-800';
const emptyOf = (f) => (f.empty === undefined ? '' : f.empty);
const isSet = (f, values) => {
  const v = values?.[f.key];
  return v !== undefined && v !== null && String(v).trim() !== '' && v !== emptyOf(f);
};
const optionsOf = (f) => [...(f.allLabel ? [{ value: emptyOf(f), label: f.allLabel }] : []), ...(f.options || [])];

function pillText(f, value) {
  if (f.pillLabel) return f.pillLabel(value);
  if (f.type === 'date') return `${f.label}: ${formatDate(value)}`;
  if (f.type === 'text') return `${f.label}: ${value}`;
  const opt = (f.options || []).find((o) => o.value === value);
  return `${f.label}: ${opt ? opt.label : value}`;
}

/** The small label above each box. */
const SMALL_LABEL = 'mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400';

/** One control for a filter. */
function FilterControl({ filter: f, value, onChange, id }) {
  if (f.type === 'date') {
    return <Input id={id} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={f.label} />;
  }
  if (f.type === 'text') {
    return (
      <Input
        id={id}
        type={f.inputType || 'text'}
        inputMode={f.inputMode}
        autoComplete="off"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={f.placeholder}
        aria-label={f.label}
        help={f.hint || undefined}
      />
    );
  }
  return <SelectMenu id={id} value={value} onChange={onChange} aria-label={f.label} options={optionsOf(f)} />;
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
              className={`min-h-9 whitespace-nowrap px-3 text-sm lg:min-h-8 ${segmentItem(active)}`}
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
  searchRef,
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
  const canClear = active.length > 0;
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

  return (
    <div className={`${plain ? '' : CARD_ON_PC} ${className}`}>
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        {(hasSearch || others.length > 0) && (
          <div className="flex min-w-0 items-center gap-2 md:contents">
            {hasSearch && (
              <div className="min-w-0 flex-1 md:w-64 md:flex-none">
                <label htmlFor={`${baseId}-search`} className={`hidden md:block ${SMALL_LABEL}`}>
                  {t('filters.search', 'Search')}
                </label>
                <SearchInput
                  id={`${baseId}-search`}
                  ref={searchRef}
                  size="md"
                  value={search ?? ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder || t('search.placeholder', 'Search...')}
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </div>
            )}

            {/* Phones: a filter button that opens the filters under the search box. */}
            {others.length > 0 && (
              <Tooltip
                content={panelOpen ? t('filters.hide', 'Hide filters') : t('filters.show', 'Show filters')}
                className={hasSearch ? 'flex-shrink-0 md:hidden' : 'md:hidden'}
              >
                <Button
                  variant={hasSearch || panelOpen ? 'primary' : 'secondary'}
                  size={hasSearch ? 'icon' : undefined}
                  className="relative"
                  onClick={() => setPanelOpen((o) => !o)}
                  aria-expanded={panelOpen}
                  aria-controls={panelId}
                  aria-label={hasSearch ? filtersLabel : undefined}
                  leftIcon={hasSearch ? undefined : <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
                >
                  {hasSearch ? <SlidersHorizontal className="h-5 w-5" aria-hidden="true" /> : filtersLabel}
                  {hasSearch && active.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
                      {active.length}
                    </span>
                  )}
                </Button>
              </Tooltip>
            )}

            {/* Tablet and PC: each filter in the row, a small label above. */}
            {others.map((f) => {
              const id = `${baseId}-${f.key}`;
              return (
                <div key={f.key} className={`hidden min-w-0 md:block ${f.type === 'date' ? 'md:w-40' : 'md:w-44'}`}>
                  <label htmlFor={id} className={SMALL_LABEL}>
                    {f.label}
                  </label>
                  <FilterControl filter={f} id={id} value={values[f.key] ?? emptyOf(f)} onChange={(v) => setOne(f.key, v)} />
                </div>
              );
            })}
          </div>
        )}

        {segments.map((f) => (
          <div key={f.key} className="min-w-0">
            {f.label && <span className={`hidden md:block ${SMALL_LABEL}`}>{f.label}</span>}
            <Segment filter={f} value={values[f.key]} onChange={(v) => setOne(f.key, v)} />
          </div>
        ))}
      </div>

      {/* Phones: the filters, two to a row; a lone last one takes the whole row. */}
      {others.length > 0 && panelOpen && (
        <div
          id={panelId}
          className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-card dark:border-neutral-700 dark:bg-neutral-800 md:hidden"
        >
          {others.map((f, i) => {
            const id = `${baseId}-m-${f.key}`;
            const alone = others.length % 2 === 1 && i === others.length - 1;
            return (
              <div key={f.key} className={`min-w-0 ${alone ? 'col-span-2' : ''}`}>
                <label htmlFor={id} className={SMALL_LABEL}>
                  {f.label}
                </label>
                <FilterControl filter={f} id={id} value={values[f.key] ?? emptyOf(f)} onChange={(v) => setOne(f.key, v)} />
              </div>
            );
          })}
        </div>
      )}

      {canClear && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {active.map((f) => (
            <span
              key={f.key}
              className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full bg-neutral-100 py-0.5 pl-3 pr-1 text-xs text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
            >
              <span className="min-w-0 truncate">{pillText(f, values[f.key])}</span>
              <Tooltip content={t('filters.remove', 'Remove this filter')}>
                <button
                  type="button"
                  onClick={() => setOne(f.key, emptyOf(f))}
                  aria-label={t('filters.removeNamed', 'Remove {{name}}', { name: pillText(f, values[f.key]) })}
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
