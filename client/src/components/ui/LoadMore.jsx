import { useTranslation } from 'react-i18next';
import Button from './Button.jsx';
import { TEXT_MUTED } from './tokens.js';

/**
 * LoadMore — the foot of a list that loads in chunks (a cursor API such as the activity logs,
 * where page numbers aren't possible). Same place and spacing as `Pagination`: a line saying how
 * many are shown and a "Load more" button (full width on phones, a big tap target), or an
 * "end of the list" line once everything is loaded.
 *
 * Props: hasMore, loading, onLoadMore(), shown? (rows on screen), endText?, className? (default `mt-4`)
 *
 * @example
 * <LoadMore hasMore={hasNextPage} loading={isFetchingNextPage} onLoadMore={fetchNextPage} shown={items.length} />
 */
export default function LoadMore({ hasMore, loading = false, onLoadMore, shown, endText, className = 'mt-4' }) {
  const { t } = useTranslation('common');
  const count = Number(shown) || 0;
  return (
    <div className={`flex flex-col items-center gap-2 text-center text-xs ${TEXT_MUTED} ${className}`}>
      {count > 0 && <p aria-live="polite">{t('pagination.shown', 'Showing {{count}}', { count })}</p>}
      {hasMore ? (
        <Button variant="secondary" loading={loading} onClick={() => onLoadMore()} className="w-full sm:w-auto sm:min-w-40">
          {t('pagination.loadMore', 'Load more')}
        </Button>
      ) : (
        count > 0 && <p>{endText || t('pagination.end', "That's everything.")}</p>
      )}
    </div>
  );
}
