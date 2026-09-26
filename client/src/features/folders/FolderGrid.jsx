import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Folder, Heart } from 'lucide-react';
import { SkeletonCards } from '@/components/ui/Skeleton.jsx';
import { GRID_GAP } from '@/components/ui/tokens.js';
import FolderActionsMenu from './FolderActionsMenu.jsx';
import { folderColor, siblingColors } from './folderColors.js';
import { folderName } from './folderTreeUtils.js';

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
// evenly (auto-fit, so a short row has no empty space at the end).
const GRID = `grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(210px,1fr))] ${GRID_GAP}`;

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
  return (
    <div className="relative flex h-full min-h-[8.5rem] flex-col rounded-2xl border border-neutral-200 bg-white p-3.5 sm:min-h-[10rem] sm:p-4 shadow-soft-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50/60 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80">
      {/* The wave is clipped to the card; the ⋮ menu must not be, so only this layer hides overflow. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <Wave className={color.wave} />
      </div>
      {/* The whole card opens the folder; the ⋮ sits above this link. */}
      <Link
        to={`/browse/${folder.id}`}
        aria-label={`${name}, ${inside}`}
        className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
      />
      <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col">
        <FolderGlyph folder={folder} colors={colors} className="h-11 w-11 sm:h-12 sm:w-12" />
        <p className="mt-2 truncate text-sm font-semibold text-neutral-900 sm:mt-3 sm:text-[15px] dark:text-neutral-100" title={name}>
          {name}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-neutral-500 sm:text-[13px] dark:text-neutral-400">{inside}</span>
          <span className="flex h-8 w-8 flex-shrink-0 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
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

export function FolderGridSkeleton({ count = 4 }) {
  return <SkeletonCards count={count} className="grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(210px,1fr))]" tileHeight={136} />;
}
