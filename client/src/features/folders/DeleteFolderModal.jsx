import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import { foldersApi } from '@/services/foldersApi.js';
import { useDeleteFolder } from './foldersHooks.js';

/**
 * Two-step delete confirm matching `DELETE /folders/:id?confirm=1`'s shape
 * (docs/API.md): the first call (no `confirm`) returns
 * `{ requiresConfirm: true, folderCount, documentCount, fileCount }` instead
 * of deleting — we show those counts, then re-call with `confirm: true`.
 */
export default function DeleteFolderModal({ isOpen, onClose, folder, onDeleted }) {
  const { t } = useTranslation(['browse', 'common']);
  const [counts, setCounts] = useState(null);
  const [checking, setChecking] = useState(false);
  const del = useDeleteFolder();

  useEffect(() => {
    if (!isOpen || !folder) return;
    setCounts(null);
    setChecking(true);
    foldersApi
      .remove(folder.id, { confirm: false })
      .then((res) => setCounts(res))
      .catch(() => setCounts({ requiresConfirm: true, folderCount: 0, documentCount: 0, fileCount: 0 }))
      .finally(() => setChecking(false));
  }, [isOpen, folder]);

  const handleConfirm = async () => {
    try {
      await del.mutateAsync({ id: folder.id, confirm: true });
      toast.success(t('deleteModal.toastDeleted', '"{{name}}" deleted', { name: folder.name }));
      onDeleted?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('deleteModal.toastFailed', 'Could not delete the folder'));
    }
  };

  const isEmpty = counts && counts.folderCount === 0 && counts.documentCount === 0 && counts.fileCount === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('deleteModal.title', 'Delete "{{name}}"?', { name: folder?.name })}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={del.isPending}>{t('common:actions.cancel', 'Cancel')}</Button>
          <Button variant="danger" onClick={handleConfirm} loading={del.isPending} disabled={checking}>
            {t('common:actions.delete', 'Delete')}
          </Button>
        </>
      }
    >
      {checking ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : isEmpty ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t('deleteModal.emptyNotice', 'This folder is empty.')} {t('common:confirmModal.cannotBeUndone', 'This action cannot be undone.')}
        </p>
      ) : (
        <div className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
          <p className="font-medium text-red-600 dark:text-red-400">
            {t('deleteModal.permanentWarning', 'This will permanently delete everything inside this folder:')}
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {counts?.folderCount > 0 && (
              <li>
                {counts.folderCount === 1
                  ? t('deleteModal.subfolders_one', '{{count}} subfolder', { count: counts.folderCount })
                  : t('deleteModal.subfolders_other', '{{count}} subfolders', { count: counts.folderCount })}
              </li>
            )}
            {counts?.documentCount > 0 && (
              <li>
                {counts.documentCount === 1
                  ? t('common:units.document_one', '{{count}} document', { count: counts.documentCount })
                  : t('common:units.document_other', '{{count}} documents', { count: counts.documentCount })}
              </li>
            )}
            {counts?.fileCount > 0 && (
              <li>
                {counts.fileCount === 1
                  ? t('common:units.file_one', '{{count}} file', { count: counts.fileCount })
                  : t('common:units.file_other', '{{count}} files', { count: counts.fileCount })}
              </li>
            )}
          </ul>
          <p>{t('common:confirmModal.cannotBeUndone', 'This action cannot be undone.')}</p>
        </div>
      )}
    </Modal>
  );
}
