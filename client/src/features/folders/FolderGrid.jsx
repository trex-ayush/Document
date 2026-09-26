import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FileText, Folder, Heart, KeyRound, StickyNote } from 'lucide-react';
import { SkeletonCards } from '@/components/ui/Skeleton.jsx';
import { GRID_GAP, KIND_ICON } from '@/components/ui/tokens.js';
import { filesApi } from '@/services/filesApi.js';
import { formatDate } from '@/i18n/formatters.js';
import FolderActionsMenu from './FolderActionsMenu.jsx';
import { folderColor, siblingColors } from './folderColors.js';
import { folderName } from './folderTreeUtils.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

/**
 * Folders as cards (Home and Browse): 2 per row on phones; wider screens fit as many cards (at
 * least 210px) as the row holds, stretched to fill it.
 *
 *   ┌───────────────────────┐
 *   │ [folder]            ⋮ │   the folder in its own colour (Shared: coral + heart), ⋮ menu
 *   │ Papa                  │   name (one line, "…")
 *   │ 4 items           (›) │   what's inside, round › in a neutral circle
 *   │ ～～～～～～～～～～～ │   a soft wave in the folder's colour
 *   └───────────────────────┘
 *
 * The whole card opens the folder; the ⋮ (Rename, Move, Share, Delete — only Share for Shared)
 * sits above it. `handlers` ({ onRename, onMove, onDelete }, each taking the folder) turn the
 * menu on; without them there's no ⋮.
 */

// Phones: two per row. Wider screens: as many ~210px+ cards as fit, stretched to fill the row
// evenly, at most 4 to a row; a lone folder stays card-sized instead of stretching across.
const GRID = `grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(max(210px,calc((100%_-_3rem)/4)),1fr))] ${GRID_GAP}`;

/** Everything directly inside the folder (subfolders + documents + passwords/notes). */
export function insideLabel(folder, t) {
  const count = (folder.folderCount ?? 0) + (folder.documentCount ?? 0) + (folder.itemCount ?? 0);
  if (!count) return t('dashboard:folders.emptyFolder', 'Empty');
  return count === 1
    ? t('dashboard:folders.itemCount_one', '{{count}} item', { count })
    : t('dashboard:folders.itemCount_other', '{{count}} items', { count });
}

/** The folder icon in its colour; the family's Shared folder carries a small heart. */
export function FolderGlyph({ folder, colors, className = 'h-11 w-11' }) {
  const color = folderColor(folder, colors);
  return (
    <span className="relative inline-flex w-fit flex-shrink-0 self-start">
      <Folder className={`${className} ${color.icon}`} strokeWidth={1.5} aria-hidden="true" />
      {folder.isSystem && (
        <Heart
          className="absolute -bottom-0.5 -right-1 h-[42%] w-[42%] fill-primary-500 text-white dark:text-neutral-800"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

function Wave({ className }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 240 40"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-9 w-full sm:h-10"
    >
      <path d="M0 26 C 42 12, 84 36, 132 24 S 204 10, 240 20 L 240 40 L 0 40 Z" className={className} />
      <path d="M0 32 C 54 22, 108 40, 162 30 S 222 22, 240 28 L 240 40 L 0 40 Z" className={className} />
    </svg>
  );
}

function FolderCard({ folder, colors, handlers }) {
  const { t } = useTranslation(['dashboard', 'browse']);
  const name = folderName(folder, t);
  const inside = insideLabel(folder, t);
  const color = folderColor(folder, colors);
  const withMenu = Boolean(handlers);
  const to = `/browse/${folder.id}`;
  return (
    <Tooltip content={t('common:tip.openFolder', 'Open this folder')} className="grid h-full">
    <div className="relative flex h-full min-h-[8.5rem] flex-col rounded-2xl border border-neutral-200 bg-white p-3.5 sm:min-h-[10rem] sm:p-4 shadow-soft-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50/60 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80">
      {/* The wave is clipped to the card; the ⋮ menu must not be, so only this layer hides overflow. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <Wave className={color.wave} />
      </div>
      {/* The whole card opens the folder; the ⋮ sits above this link. */}
      <Link
        to={to}
        aria-label={`${name}, ${inside}`}
        className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
      />
      <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col">
        <FolderGlyph folder={folder} colors={colors} className="h-11 w-11 sm:h-12 sm:w-12" />
        {/* The name and › take the pointer (for their tooltips) and are links to the folder too,
            so a click on them still opens it. Hidden from screen readers and Tab — the card link
            above already says all this. */}
        <Tooltip content={name} onlyWhenOverflow className="pointer-events-auto mt-2 flex min-w-0 sm:mt-3">
          <Link to={to} tabIndex={-1} aria-hidden="true" className="block min-w-0 truncate text-sm font-semibold text-neutral-900 sm:text-[15px] dark:text-neutral-100">
            {name}
          </Link>
        </Tooltip>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-neutral-500 sm:text-[13px] dark:text-neutral-400">{inside}</span>
          <Tooltip content={t('common:tip.openFolder', 'Open this folder')} className="pointer-events-auto inline-flex flex-shrink-0">
            <Link
              to={to}
              tabIndex={-1}
              aria-hidden="true"
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Tooltip>
        </div>
      </div>
      {withMenu && (
        <div className="absolute right-1 top-1">
          <FolderActionsMenu
            folder={folder}
            vertical
            onRename={() => handlers.onRename(folder)}
            onMove={() => handlers.onMove(folder)}
            onDelete={() => handlers.onDelete(folder)}
          />
        </div>
      )}
    </div>
    </Tooltip>
  );
}

export default function FolderGrid({ folders = [], handlers, colors }) {
  // Colours are handed out among the folders shown together (siblings), unless the caller has them.
  const palette = colors || siblingColors(folders);
  return (
    <ul className={GRID}>
      {folders.map((f) => (
        <li key={f.id} className="min-w-0">
          <FolderCard folder={f} colors={palette} handlers={handlers} />
        </li>
      ))}
    </ul>
  );
}

const CARD_SHELL =
  'relative flex h-full min-h-[8.5rem] flex-col rounded-2xl border border-neutral-200 bg-white p-3.5 sm:min-h-[10rem] sm:p-4 shadow-soft-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50/60 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80';

/**
 * A document, password or note as a card for the grid view inside a folder: the document's first
 * photo (or its kind icon in its colour), the title (2 lines at most) and a short meta line. The
 * whole card opens it.
 */
function ContentCard({ entry }) {
  const { t } = useTranslation(['browse', 'common']);
  const data = entry.data;
  const isDoc = entry.type === 'document';
  const isNote = !isDoc && data.kind === 'note';
  const title = data.title || t('rows.untitled', 'Untitled');
  const thumb = isDoc ? data.primaryThumbUrl || data.thumbnailUrl : null;
  const files = isDoc ? data.fileCount ?? data.files?.length ?? 0 : 0;
  const meta = isDoc
    ? [formatDate(data.createdAt || data.updatedAt), files === 1 ? t('common:units.file_one', '{{count}} file', { count: files }) : t('common:units.file_other', '{{count}} files', { count: files })].filter(Boolean).join(' · ')
    : isNote
      ? t('rows.note', 'Note')
      : t('rows.password', 'Password');
  const Icon = isDoc ? FileText : isNote ? StickyNote : KeyRound;
  const tone = KIND_ICON[isDoc ? 'document' : isNote ? 'note' : 'password'];
  const to = isDoc ? `/documents/${data.id}` : `/items/${data.id}`;
  const tip = isDoc
    ? t('common:tip.openDocument', 'Open this document')
    : isNote
      ? t('common:tip.openNote', 'Read this note')
      : t('common:tip.openPassword', 'See this password');
  return (
    <Tooltip content={tip} className="grid h-full">
    <div className={CARD_SHELL}>
      <Link
        to={to}
        aria-label={`${title}, ${meta}`}
        className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
      />
      <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col">
        {thumb ? (
          <img src={filesApi.resolveUrl(thumb)} alt="" loading="lazy" className="h-20 w-full rounded-lg bg-neutral-100 object-cover ring-1 ring-black/5 sm:h-24 dark:bg-neutral-700 dark:ring-white/10" />
        ) : (
          <span className="flex h-20 w-full items-center justify-center rounded-lg bg-neutral-50 sm:h-24 dark:bg-neutral-900/60">
            <Icon className={`h-10 w-10 ${tone}`} strokeWidth={1.5} aria-hidden="true" />
          </span>
        )}
        {/* Takes the pointer for its tooltip; a link too, so a click still opens it. */}
        <Tooltip content={title} onlyWhenOverflow className="pointer-events-auto mt-2 flex min-w-0 sm:mt-3">
          <Link to={to} tabIndex={-1} aria-hidden="true" className="line-clamp-2 min-w-0 break-words text-sm font-semibold text-neutral-900 sm:text-[15px] dark:text-neutral-100">
            {title}
          </Link>
        </Tooltip>
        <span className="mt-auto truncate pt-0.5 text-xs text-neutral-500 sm:text-[13px] dark:text-neutral-400">{meta}</span>
      </div>
    </div>
    </Tooltip>
  );
}

/**
 * Grid view inside a folder: subfolders as folder cards, then documents, passwords and notes as
 * cards, all in one grid. `entries` are Browse's { key, type, data } entries.
 */
export function EntryGrid({ entries = [], colors, handlers }) {
  const palette = colors || siblingColors(entries.filter((e) => e.type === 'folder').map((e) => e.data));
  return (
    <ul className={GRID}>
      {entries.map((e) => (
        <li key={e.key} className="min-w-0">
          {e.type === 'folder' ? <FolderCard folder={e.data} colors={palette} handlers={handlers} /> : <ContentCard entry={e} />}
        </li>
      ))}
    </ul>
  );
}

export function FolderGridSkeleton({ count = 4 }) {
  return <SkeletonCards count={count} className="grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(max(210px,calc((100%_-_3rem)/4)),1fr))]" tileHeight={136} />;
}
