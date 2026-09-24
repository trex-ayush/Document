import { useState } from 'react';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import FolderTree from './FolderTree.jsx';
import { useFolderTree } from './foldersHooks.js';
import { descendantIds, ROOT_ID } from './folderTreeUtils.js';

/**
 * Modal folder-tree picker for "move" flows (move a folder, move a
 * document). `excludeFolderId` — when moving a folder itself — greys out
 * that folder and all its descendants (mirrors the server's
 * `400 CANNOT_MOVE_INTO_DESCENDANT`, so the invalid choice is visibly
 * disabled rather than just server-rejected after the fact).
 *
 * `Modal` already renders as a bottom sheet under 1024px (docs/UI_KIT.md
 * §6.10) so this doubles as the mobile picker with no extra work.
 */
export default function FolderPicker({ isOpen, onClose, onPick, excludeFolderId, initialFolderId, title = 'Move to…' }) {
  const { data, isLoading } = useFolderTree({ enabled: isOpen });
  const [selected, setSelected] = useState(initialFolderId ?? ROOT_ID);

  const folders = data?.items || [];
  const disabledIds = excludeFolderId
    ? new Set([excludeFolderId, ...descendantIds(folders, excludeFolderId)])
    : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              onPick(selected);
              onClose();
            }}
            disabled={disabledIds?.has(selected)}
          >
            Move here
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <FolderTree
          folders={folders}
          activeId={selected}
          onSelect={setSelected}
          selectable
          disabledIds={disabledIds}
        />
      )}
    </Modal>
  );
}
