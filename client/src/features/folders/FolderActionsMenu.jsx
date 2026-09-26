import { useTranslation } from 'react-i18next';
import { Ellipsis, EllipsisVertical, FolderInput, Pencil, Trash2 } from 'lucide-react';
import { useCanWrite } from '@/hooks/useCanWrite.js';
import { Dropdown, DropdownItem, DropdownDivider } from '@/components/ui/Dropdown.jsx';
import ShareButton from '@/features/share/ShareButton.jsx';
import { ICON_BUTTON_CLASS } from '@/components/ui/Button.jsx';
import { folderName } from './folderTreeUtils.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

/**
 * A folder's "…" menu: Rename, Move, Share, Delete (moves to the Bin). The family's system
 * "Shared" folder can only be shared — it can't be renamed, moved or deleted.
 * Any handler left out hides its item. `vertical` shows ⋮ instead of … (folder cards).
 */
export default function FolderActionsMenu({ folder, onRename, onMove, onDelete, align = 'right', vertical = false }) {
  const { t } = useTranslation(['browse', 'common']);
  const canWrite = useCanWrite();
  // Everything in this menu changes something — view-only members don't get it.
  if (!folder || !canWrite) return null;
  const editable = !folder.isSystem;

  return (
    <Dropdown
      align={align}
      trigger={
        <Tooltip content={t('common:tip.moreOptions', 'More options')}>
          <span className={ICON_BUTTON_CLASS} aria-label={t('actionsMenu.label', 'Folder options')}>
            {vertical ? <EllipsisVertical className="h-5 w-5" aria-hidden="true" /> : <Ellipsis className="h-5 w-5" aria-hidden="true" />}
          </span>
        </Tooltip>
      }
    >
      {editable && onRename && (
        <DropdownItem onSelect={onRename}>
          <MenuRow icon={Pencil}>{t('actionsMenu.rename', 'Rename')}</MenuRow>
        </DropdownItem>
      )}
      {editable && onMove && (
        <DropdownItem onSelect={onMove}>
          <MenuRow icon={FolderInput}>{t('actionsMenu.move', 'Move')}</MenuRow>
        </DropdownItem>
      )}
      <ShareButton variant="menuitem" targetType="folder" targetId={folder.id} targetLabel={folderName(folder, t)} />
      {editable && onDelete && (
        <>
          <DropdownDivider />
          <DropdownItem danger onSelect={onDelete}>
            <span className="flex items-start gap-2">
              <Trash2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>
                <span className="block">{t('actionsMenu.delete', 'Delete')}</span>
                <span className="block text-xs font-normal text-neutral-500 dark:text-neutral-400">{t('actionsMenu.deleteHint', 'Moves to the Bin')}</span>
              </span>
            </span>
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}

function MenuRow({ icon: Icon, children }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}
