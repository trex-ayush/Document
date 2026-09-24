import { Dropdown, DropdownItem, DropdownDivider } from '@/components/ui/Dropdown.jsx';
import { MoreIcon } from '@/components/layout/icons.jsx';

/** Shared "..." action menu for a folder tile/row: rename, move, download zip, delete. */
export default function FolderActionsMenu({ onRename, onMove, onDownloadZip, onDelete }) {
  return (
    <Dropdown
      align="right"
      trigger={
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
          aria-label="Folder actions"
        >
          <MoreIcon className="h-5 w-5" />
        </span>
      }
    >
      <DropdownItem onSelect={onRename}>Rename / style</DropdownItem>
      <DropdownItem onSelect={onMove}>Move</DropdownItem>
      <DropdownItem onSelect={onDownloadZip}>Download as ZIP</DropdownItem>
      <DropdownDivider />
      <DropdownItem danger onSelect={onDelete}>Delete</DropdownItem>
    </Dropdown>
  );
}
