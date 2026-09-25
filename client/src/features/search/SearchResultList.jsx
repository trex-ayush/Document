import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { filesApi } from '@/services/filesApi.js';
import { FileText, Folder, KeyRound, StickyNote } from 'lucide-react';
import { folderName, folderPathLabel } from '@/features/folders/folderTreeUtils.js';
import { groupRows, highlightParts } from './searchResults.js';

/**
 * Grouped search results — Folders / Documents / Passwords & notes — each row showing the
 * title, where it lives (path) and, when the match was inside notes or fields, a short
 * snippet. Used by the navbar dropdown (`compact`) and the /search page.
 *
 * Props: rows (from `flattenResults`), query, activeIndex?, onHover?(index), onSelect?(row)
 * (called on click; each row is a Link and navigates by itself),
 * compact?, idPrefix? (for aria-activedescendant).
 */

function Highlighted({ text, query }) {
  return highlightParts(text, query).map((part, i) =>
    part.match ? (
      <mark key={i} className="rounded-sm bg-amber-100 px-0.5 text-inherit dark:bg-amber-500/25">
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}

function RowIcon({ row }) {
  const thumb = row.type === 'document' ? row.raw.thumbnailUrl || row.raw.primaryThumbUrl : null;
  if (thumb) {
    return (
      <span className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-700">
        <img src={filesApi.resolveUrl(thumb)} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
    );
  }
  const Icon = row.type === 'folder' ? Folder : row.type === 'document' ? FileText : row.raw.kind === 'login' ? KeyRound : StickyNote;
  const tone =
    row.type === 'folder'
      ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300'
      : row.type === 'document'
        ? 'bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300'
        : row.raw.kind === 'login'
          ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300'
          : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300';
  return (
    <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tone}`}>
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </span>
  );
}

export default function SearchResultList({ rows, query, activeIndex = -1, onHover, onSelect, compact = false, idPrefix = 'search-result' }) {
  const { t } = useTranslation('search');
  const groupLabels = {
    folders: t('groups.folders', 'Folders'),
    documents: t('groups.documents', 'Documents'),
    items: t('groups.items', 'Passwords & notes'),
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-6'}>
      {groupRows(rows).map(({ group, entries }) => (
        <section key={group} aria-label={groupLabels[group]}>
          <h3
            className={
              compact
                ? 'px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500'
                : 'mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300'
            }
          >
            {groupLabels[group]}
          </h3>
          <ul className={compact ? '' : 'divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800'}>
            {entries.map(({ row, index }) => {
              const active = index === activeIndex;
              const count = row.type === 'document' ? row.raw.fileCount : null;
              const title = row.type === 'folder' ? folderName(row.raw, t) : row.title;
              const path = folderPathLabel(row.path, t);
              return (
                <li key={row.key}>
                  <Link
                    id={`${idPrefix}-${index}`}
                    to={row.to}
                    role={compact ? 'option' : undefined}
                    aria-selected={compact ? active : undefined}
                    tabIndex={compact ? -1 : undefined}
                    onMouseEnter={onHover ? () => onHover(index) : undefined}
                    onClick={onSelect ? () => onSelect(row) : undefined}
                    className={`flex items-center gap-3 transition-colors ${compact ? 'rounded-lg px-3 py-2' : 'px-4 py-3'} ${
                      active ? 'bg-neutral-100 dark:bg-neutral-700' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/60'
                    }`}
                  >
                    <RowIcon row={row} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        <Highlighted text={title} query={query} />
                      </span>
                      {(path || count) && (
                        <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {path}
                          {path && count ? ' · ' : ''}
                          {count ? t('fileCount', { count, defaultValue: '{{count}} files' }) : ''}
                        </span>
                      )}
                      {row.snippet && (
                        <span className={`mt-0.5 block text-xs text-neutral-600 dark:text-neutral-300 ${compact ? 'truncate' : 'line-clamp-2'}`}>
                          <Highlighted text={row.snippet} query={query} />
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
