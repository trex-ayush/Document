import { useTranslation } from 'react-i18next';
import { Dropdown, DropdownItem, DropdownDivider } from '@/components/ui/Dropdown.jsx';
import { MoreIcon } from '@/components/layout/icons.jsx';

/** Shared "..." action menu for a folder tile/row: rename, move, download zip, delete. */
export default function FolderActionsMenu({ onRename, onMove, onDownloadZip, onDelete }) {
  const { t } = useTranslation(['browse', 'common']);
  return (
    <Dropdown
      align="right"
      trigger={
        <span
          className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
          aria-label={t('actionsMenu.label', 'Folder actions')}
        >
          <MoreIcon className="h-5 w-5" />
        </span>
      }
    >
      <DropdownItem onSelect={onRename}>{t('actionsMenu.renameStyle', 'Rename / style')}</DropdownItem>
      <DropdownItem onSelect={onMove}>{t('common:actions.move', 'Move')}</DropdownItem>
      <DropdownItem onSelect={onDownloadZip}>{t('actionsMenu.downloadZip', 'Download as ZIP')}</DropdownItem>
      <DropdownDivider />
      <DropdownItem danger onSelect={onDelete}>{t('common:actions.delete', 'Delete')}</DropdownItem>
    </Dropdown>
  );
}
