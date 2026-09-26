import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import FolderFormModal from './FolderFormModal.jsx';
import DeleteFolderModal from './DeleteFolderModal.jsx';
import FolderPicker from './FolderPicker.jsx';
import { folderName } from './folderTreeUtils.js';
import { useUpdateFolder } from './foldersHooks.js';

/**
 * Everything a folder's ⋮ menu needs, in one place for Home and Browse: the handlers to pass to
 * `FolderActionsMenu` (each takes the folder) and the rename / delete / move drawers to render.
 *
 * @param {{ onDeleted?: (folder) => void }} [opts]
 * @returns {{ handlers: { onRename, onMove, onDelete }, dialogs: JSX.Element }}
 */
export function useFolderActions({ onDeleted } = {}) {
  const { t } = useTranslation(['browse', 'common']);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [moving, setMoving] = useState(null);
  const updateFolder = useUpdateFolder();

  const handleMove = (targetFolderId) => {
    if (!moving || !targetFolderId) return;
    const name = folderName(moving, t);
    updateFolder.mutate(
      { id: moving.id, parentId: targetFolderId },
      {
        onSuccess: () => toast.success(t('toasts.folderMoved', 'Moved “{{name}}”', { name })),
        onError: (err) => toast.error(err?.response?.data?.message || t('toasts.folderMoveFailed', 'Could not move the folder')),
      },
    );
  };

  const dialogs = (
    <>
      <FolderFormModal isOpen={Boolean(editing)} onClose={() => setEditing(null)} folder={editing} />
      <DeleteFolderModal isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} folder={deleting} onDeleted={onDeleted} />
      <FolderPicker
        isOpen={Boolean(moving)}
        onClose={() => setMoving(null)}
        onPick={handleMove}
        excludeFolderId={moving?.id}
        allowRoot
        title={t('movePicker.title', 'Move “{{name}}”', { name: moving ? folderName(moving, t) : '' })}
      />
    </>
  );

  return { handlers: { onRename: setEditing, onMove: setMoving, onDelete: setDeleting }, dialogs };
}
