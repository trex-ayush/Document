import { useTranslation } from 'react-i18next';
import { Dropdown, DropdownItem, DropdownDivider } from '@/components/ui/Dropdown.jsx';
import { Download, Ellipsis, FolderInput, Pencil, Trash2 } from 'lucide-react';

/**
 * Shared folder action menu: rename, move, download zip, delete.
 *  - No `label`: compact "..." trigger for a folder tile/row (always visible on touch).
 *  - With `label`: a labelled button (icon + text) — used in the Browse header for the folder
 *    you're currently inside, so it's obvious without having to discover an icon.
 * Any handler left out hides its item.
 */
export default function FolderActionsMenu({ onRename, onMove, onDownloadZip, onDelete, label, align = 'right' }) {
  const { t } = useTranslation(['browse', 'common']);
  const trigger = label ? (
    <span className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700">
      <Ellipsis className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  ) : (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
      aria-label={t('actionsMenu.label', 'Folder actions')}
    >
      <Ellipsis className="h-5 w-5" />
    </span>
  );

  return (
    <Dropdown align={align} trigger={trigger}>
      {onRename && (
        <DropdownItem onSelect={onRename}>
          <MenuRow icon={Pencil}>{t('actionsMenu.rename', 'Rename')}</MenuRow>
        </DropdownItem>
      )}
      {onMove && (
        <DropdownItem onSelect={onMove}>
          <MenuRow icon={FolderInput}>{t('actionsMenu.move', 'Move to another folder')}</MenuRow>
        </DropdownItem>
      )}
      {onDownloadZip && (
        <DropdownItem onSelect={onDownloadZip}>
          <MenuRow icon={Download}>{t('actionsMenu.downloadZip', 'Download as ZIP')}</MenuRow>
        </DropdownItem>
      )}
      {onDelete && (
        <>
          <DropdownDivider />
          <DropdownItem danger onSelect={onDelete}>
            <MenuRow icon={Trash2}>{t('actionsMenu.delete', 'Delete folder')}</MenuRow>
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}

// min-h-6 + DropdownItem's py-2.5 = a 44px tap target per row.
function MenuRow({ icon: Icon, children }) {
  return (
    <span className="flex min-h-6 items-center gap-2 whitespace-nowrap">
      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}
