import { Card, CardBody } from '@/components/ui/Card.jsx';
import FolderActionsMenu from './FolderActionsMenu.jsx';

/** Grid tile for a folder inside Browse. */
export default function FolderCard({ folder, onOpen, onRename, onMove, onDownloadZip, onDelete }) {
  return (
    <Card hover className="group relative">
      <CardBody padding="md" className="cursor-pointer" onClick={() => onOpen(folder)}>
        <div className="flex items-start justify-between gap-2">
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xl"
            style={{ backgroundColor: `${folder.color || '#78716C'}22` }}
          >
            {folder.icon || '📁'}
          </div>
          <div className="opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <FolderActionsMenu
              onRename={() => onRename(folder)}
              onMove={() => onMove(folder)}
              onDownloadZip={() => onDownloadZip(folder)}
              onDelete={() => onDelete(folder)}
            />
          </div>
        </div>
        <p className="mt-3 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{folder.name}</p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {folder.folderCount ?? 0} folder{(folder.folderCount ?? 0) === 1 ? '' : 's'} ·{' '}
          {folder.documentCount ?? 0} doc{(folder.documentCount ?? 0) === 1 ? '' : 's'}
        </p>
      </CardBody>
    </Card>
  );
}
