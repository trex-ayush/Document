import { useTranslation } from 'react-i18next';
import { filesApi } from '@/services/filesApi.js';
import { ListCard, ListIcon, ListRow } from '@/components/ui/ListRow.jsx';
import { GROUP_LABEL } from '@/components/ui/tokens.js';
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
      <mark key={i} className="rounded-sm bg-primary-100 px-0.5 text-inherit dark:bg-primary-500/25">
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}

function RowIcon({ row }) {
  const thumb = row.type === 'document' ? row.raw.thumbnailUrl || row.raw.primaryThumbUrl : null;
  if (thumb) return <ListIcon src={filesApi.resolveUrl(thumb)} />;
  if (row.type === 'folder') return <ListIcon icon={Folder} kind="folder" />;
  if (row.type === 'document') return <ListIcon icon={FileText} kind="document" />;
  return row.raw.kind === 'login' ? <ListIcon icon={KeyRound} kind="password" /> : <ListIcon icon={StickyNote} kind="note" />;
}

export default function SearchResultList({ rows, query, activeIndex = -1, onHover, onSelect, compact = false, idPrefix = 'search-result' }) {
  const { t } = useTranslation('search');
  const groupLabels = {
    folders: t('groups.folders', 'Folders'),
    documents: t('groups.documents', 'Documents'),
    items: t('groups.items', 'Passwords & notes'),
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4 sm:space-y-6'}>
      {groupRows(rows).map(({ group, entries }) => {
        const Group = compact ? 'ul' : ListCard;
        return (
          <section key={group} aria-label={groupLabels[group]}>
            <h3 className={compact ? `px-3 pb-1 pt-1.5 ${GROUP_LABEL}` : `mb-2 ${GROUP_LABEL}`}>{groupLabels[group]}</h3>
            <Group {...(compact ? {} : { as: 'ul' })}>
              {entries.map(({ row, index }) => {
                const count = row.type === 'document' ? row.raw.fileCount : null;
                const title = row.type === 'folder' ? folderName(row.raw, t) : row.title;
                const path = folderPathLabel(row.path, t);
                const meta = (path || count)
                  ? `${path}${path && count ? ' · ' : ''}${count ? t('fileCount', { count, defaultValue: '{{count}} files' }) : ''}`
                  : null;
                return (
                  <ListRow
                    key={row.key}
                    as="li"
                    compact={compact}
                    active={index === activeIndex}
                    to={row.to}
                    onClick={onSelect ? () => onSelect(row) : undefined}
                    mainProps={{
                      id: `${idPrefix}-${index}`,
                      role: compact ? 'option' : undefined,
                      'aria-selected': compact ? index === activeIndex : undefined,
                      tabIndex: compact ? -1 : undefined,
                      onMouseEnter: onHover ? () => onHover(index) : undefined,
                    }}
                    icon={<RowIcon row={row} />}
                    title={<Highlighted text={title} query={query} />}
                    meta={meta}
                    snippet={row.snippet ? <Highlighted text={row.snippet} query={query} /> : null}
                  />
                );
              })}
            </Group>
          </section>
        );
      })}
    </div>
  );
}
