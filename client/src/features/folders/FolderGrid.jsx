import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import Skeleton from '@/components/ui/Skeleton.jsx';
import { CARD_PADDING, CARD_SURFACE, GRID_GAP, KIND_TONE } from '@/components/ui/tokens.js';
import { folderName } from './folderTreeUtils.js';

/**
 * Folders as big tappable tiles (Home page): 2 per row on phones, 3 from `sm`, 5 from `lg`.
 * Each tile is one link to `/browse/:id` — folder icon, name (up to 2 lines), how much is inside.
 */

const GRID = `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 ${GRID_GAP}`;

/** Everything directly inside the folder (subfolders + documents + passwords/notes). */
function insideLabel(folder, t) {
  const count = (folder.folderCount ?? 0) + (folder.documentCount ?? 0) + (folder.itemCount ?? 0);
  if (!count) return t('dashboard:folders.emptyFolder', 'Empty');
  return count === 1
    ? t('dashboard:folders.itemCount_one', '{{count}} item', { count })
    : t('dashboard:folders.itemCount_other', '{{count}} items', { count });
}

export function FolderTile({ folder }) {
  const { t } = useTranslation(['dashboard', 'browse']);
  const name = folderName(folder, t);
  // Folders have no colour of their own today (server sends none); honour one if it ever appears.
  const style = folder.color ? { color: folder.color } : undefined;
  return (
    <Link
      to={`/browse/${folder.id}`}
      className={`flex h-full min-h-[7.5rem] min-w-0 flex-col transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:bg-neutral-100 dark:hover:bg-neutral-700/50 dark:active:bg-neutral-700 ${CARD_SURFACE} ${CARD_PADDING}`}
    >
      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${KIND_TONE.folder}`} style={style}>
        <Folder className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="mt-2 line-clamp-2 break-words text-sm font-semibold text-neutral-900 [overflow-wrap:anywhere] dark:text-neutral-100" title={name}>
        {name}
      </span>
      <span className="mt-auto pt-1 text-xs text-neutral-500 dark:text-neutral-400">{insideLabel(folder, t)}</span>
    </Link>
  );
}

export default function FolderGrid({ folders = [] }) {
  return (
    <ul className={GRID}>
      {folders.map((f) => (
        <li key={f.id} className="min-w-0">
          <FolderTile folder={f} />
        </li>
      ))}
    </ul>
  );
}

export function FolderGridSkeleton({ count = 6 }) {
  return (
    <div className={GRID} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={120} rounded="lg" />
      ))}
    </div>
  );
}
