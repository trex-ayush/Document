import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Drawer from '@/components/ui/Drawer.jsx';
import Button from '@/components/ui/Button.jsx';
import { LoadingState } from '@/components/ui/PageState.jsx';
import FolderTree from './FolderTree.jsx';
import { useFolderTree } from './foldersHooks.js';
import { descendantIds, ROOT_ID } from './folderTreeUtils.js';

/**
 * Modal folder picker for "move" flows (move a folder, move a document/password/note).
 *
 *  - `allowRoot` (default false): offer "Folders (top level)" as a target. Only folders may sit
 *    at the top level, so pass it when moving a folder; leave it off for everything else.
 *  - `excludeFolderId`: when moving a folder, greys out that folder and everything inside it
 *    (mirrors the server's `400 CANNOT_MOVE_INTO_DESCENDANT`).
 *
 * `onPick(folderId)` gets a folder id, or 'root' for the top level. `title` / `confirmLabel`
 * override the "Move to…" / "Move here" wording (e.g. "Save in…" / "Save here" on the add forms).
 */
export default function FolderPicker({ isOpen, onClose, onPick, excludeFolderId, initialFolderId, allowRoot = false, title, confirmLabel }) {
  const { t } = useTranslation(['browse', 'common']);
  const { data, isLoading } = useFolderTree({ enabled: isOpen });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (isOpen) setSelected(initialFolderId ?? (allowRoot ? ROOT_ID : null));
  }, [isOpen, initialFolderId, allowRoot]);

  const folders = data?.items || [];
  const disabledIds = excludeFolderId
    ? new Set([excludeFolderId, ...descendantIds(folders, excludeFolderId)])
    : undefined;

  return (
    <Drawer
      side="right"
      isOpen={isOpen}
      onClose={onClose}
      title={title ?? t('picker.defaultTitle', 'Move to…')}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={() => {
              onPick(selected);
              onClose();
            }}
            disabled={!selected || disabledIds?.has(selected)}
          >
            {confirmLabel ?? t('picker.moveHere', 'Move here')}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <LoadingState />
      ) : (
        <FolderTree
          folders={folders}
          activeId={selected}
          onSelect={setSelected}
          selectable
          showRoot={allowRoot}
          disabledIds={disabledIds}
        />
      )}
    </Drawer>
  );
}
