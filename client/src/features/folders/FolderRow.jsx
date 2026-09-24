import FolderActionsMenu from './FolderActionsMenu.jsx';

/** List-view row for a folder inside Browse. */
export default function FolderRow({ folder, onOpen, onRename, onMove, onDownloadZip, onDelete }) {
  return (
    <div
      className="group flex min-h-[56px] cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2.5 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
      onClick={() => onOpen(folder)}
    >
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-lg"
        style={{ backgroundColor: `${folder.color || '#78716C'}22` }}
      >
        {folder.icon || '📁'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{folder.name}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {folder.folderCount ?? 0} folder{(folder.folderCount ?? 0) === 1 ? '' : 's'} · {folder.documentCount ?? 0} doc{(folder.documentCount ?? 0) === 1 ? '' : 's'}
        </p>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <FolderActionsMenu
          onRename={() => onRename(folder)}
          onMove={() => onMove(folder)}
          onDownloadZip={() => onDownloadZip(folder)}
          onDelete={() => onDelete(folder)}
        />
      </div>
    </div>
  );
}
