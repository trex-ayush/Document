import { useTranslation } from 'react-i18next';
import { Card, CardBody } from '@/components/ui/Card.jsx';
import FolderActionsMenu from './FolderActionsMenu.jsx';

/** Grid tile for a folder inside Browse. */
export default function FolderCard({ folder, onOpen, onRename, onMove, onDownloadZip, onDelete }) {
  const { t } = useTranslation('common');
  const folderCount = folder.folderCount ?? 0;
  const documentCount = folder.documentCount ?? 0;
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
          {/* Always visible below `lg` — touch devices have no `:hover`, so a
              hover-only reveal (the desktop behavior) would make this menu
              permanently unreachable on mobile/tablet. */}
          <div className="opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
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
          {folderCount === 1
            ? t('units.folder_one', '{{count}} folder', { count: folderCount })
            : t('units.folder_other', '{{count}} folders', { count: folderCount })}
          {' · '}
          {documentCount === 1
            ? t('units.document_one', '{{count}} document', { count: documentCount })
            : t('units.document_other', '{{count}} documents', { count: documentCount })}
        </p>
      </CardBody>
    </Card>
  );
}
