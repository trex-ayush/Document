import { Trans, useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button.jsx';
import SelectMenu from './SelectMenu.jsx';
import Tooltip from './Tooltip.jsx';
import { TEXT_MUTED } from './tokens.js';
import { pageCount, pageNumbers, pageRange } from './pagination.js';

/**
 * Pagination — the page bar under a list or table: "Showing 26–50 of 120", an optional
 * rows-per-page menu, and ‹ 1 … 4 5 6 … 12 › page buttons.
 *
 * Ported from the starter's pagination (apps/template/src/components/Pagination.jsx for the page
 * numbers with "…" gaps and the dark current-page button; apps/component ptm/Pagination.tsx for
 * the "Rows per page" menu). Changed for this app: our `Button` for ‹ ›, our `SelectMenu` for the
 * page-size menu (never a native select), `neutral-*` greys, en/hi text, and a phone layout —
 * below `sm` it is just "‹  Page 2 of 5  ›" with 44px buttons and the row range underneath, so
 * it fits a 360px screen. Composition (starter docs/design-system/COMPOSITION.md "Table +
 * pagination"): the bar sits under the list as a sibling, not inside another card.
 *
 * Hidden when there is nothing to page: no rows, or everything fits on one page at the smallest
 * page size.
 *
 * Props:
 *  - page (1-based), pageSize, total        — where we are
 *  - onPageChange(page)
 *  - onPageSizeChange?(size)                — shows the "Rows per page" menu (PC/tablet only)
 *  - pageSizeOptions?                       — default [10, 25, 50]
 *  - loading?                               — disables the controls while a page loads
 *  - className?                             — layout only (default `mt-4`)
 *
 * @example
 * <Pagination page={page} pageSize={25} total={data.total} onPageChange={setPage} />
 */
const PAGE_BTN =
  'min-w-10 h-10 rounded-lg px-2 text-sm font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 disabled:opacity-50';
const PAGE_IDLE = 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700';
const PAGE_CURRENT = 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900';
const STRONG = 'font-medium text-neutral-800 dark:text-neutral-200';

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  loading = false,
  className = 'mt-4',
}) {
  const { t } = useTranslation('common');
  const count = Number(total) || 0;
  const pages = pageCount(count, pageSize);
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const smallest = Math.min(...pageSizeOptions, Number(pageSize) || Infinity);
  if (count === 0 || (pages <= 1 && (!onPageSizeChange || count <= smallest))) return null;

  const { from, to } = pageRange(current, pageSize, count);
  const go = (p) => {
    if (p >= 1 && p <= pages && p !== current) onPageChange(p);
  };
  const prevLabel = t('pagination.previous', 'Previous page');
  const nextLabel = t('pagination.next', 'Next page');
  const b = <span className={STRONG} />;
  const showing = (
    <Trans
      t={t}
      i18nKey="pagination.showing"
      defaults="Showing <b>{{from}}</b>–<b>{{to}}</b> of <b>{{total}}</b>"
      values={{ from, to, total: count.toLocaleString('en-IN') }}
      components={{ b }}
    />
  );

  return (
    <nav aria-label={t('pagination.label', 'Pages')} className={`text-sm ${TEXT_MUTED} ${className}`}>
      {/* Phones: ‹  Page 2 of 5  › with big buttons, the row range underneath. */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <Button variant="secondary" size="icon" onClick={() => go(current - 1)} disabled={loading || current <= 1} aria-label={prevLabel}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div className="min-w-0 text-center" aria-live="polite">
          <p className="font-medium text-neutral-900 dark:text-neutral-100">
            {t('pagination.pageOf', 'Page {{page}} of {{pages}}', { page: current, pages })}
          </p>
          <p className="text-xs">{showing}</p>
        </div>
        <Button variant="secondary" size="icon" onClick={() => go(current + 1)} disabled={loading || current >= pages} aria-label={nextLabel}>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      {/* Tablet and PC: range + rows per page on the left, page buttons on the right. */}
      <div className="hidden flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:flex">
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap" aria-live="polite">{showing}</span>
          {onPageSizeChange && (
            <span className="flex items-center gap-2">
              <span className="whitespace-nowrap">{t('pagination.rowsPerPage', 'Rows per page')}</span>
              <SelectMenu
                className="w-20"
                aria-label={t('pagination.rowsPerPage', 'Rows per page')}
                value={Number(pageSize)}
                onChange={(size) => onPageSizeChange(Number(size))}
                options={pageSizeOptions.map((n) => ({ value: n, label: String(n) }))}
              />
            </span>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center gap-1">
            <Tooltip content={prevLabel}>
              <Button variant="ghost" size="icon" onClick={() => go(current - 1)} disabled={loading || current <= 1} aria-label={prevLabel}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Tooltip>
            {pageNumbers(current, pages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="px-1 text-neutral-400 dark:text-neutral-500" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => go(p)}
                  disabled={loading}
                  aria-current={p === current ? 'page' : undefined}
                  aria-label={t('pagination.goTo', 'Page {{page}}', { page: p })}
                  className={`${PAGE_BTN} ${p === current ? PAGE_CURRENT : PAGE_IDLE}`}
                >
                  {p}
                </button>
              ),
            )}
            <Tooltip content={nextLabel}>
              <Button variant="ghost" size="icon" onClick={() => go(current + 1)} disabled={loading || current >= pages} aria-label={nextLabel}>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Tooltip>
          </div>
        )}
      </div>
    </nav>
  );
}
