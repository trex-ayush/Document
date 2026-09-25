import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
 *
 * Deleting is a soft delete (docs/DECISIONS.md "Soft delete / recycle bin"): the folder and
 * everything inside it moves to the Bin and can be restored, so the copy says exactly that
 * rather than warning about permanent loss.
 */
export default function DeleteFolderModal({ isOpen, onClose, folder, onDeleted }) {
  const { t } = useTranslation(['browse', 'common']);
  const [counts, setCounts] = useState(null);
  const [checking, setChecking] = useState(false);
  const del = useDeleteFolder();
  const folderId = folder?.id;

  useEffect(() => {
    if (!isOpen || !folderId) return undefined;
    let cancelled = false;
    setCounts(null);
    setChecking(true);
    foldersApi
      .remove(folderId, { confirm: false })
      .then((res) => { if (!cancelled) setCounts(res); })
      .catch(() => { if (!cancelled) setCounts({ failed: true }); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [isOpen, folderId]);

  const handleConfirm = async () => {
    try {
      await del.mutateAsync({ id: folder.id, confirm: true });
      toast.success(t('deleteModal.toastDeleted', 'Moved to Bin — you can restore it from the Bin'));
      onDeleted?.(folder);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('deleteModal.toastFailed', 'Could not delete the folder'));
    }
  };

  const isEmpty = counts && !counts.failed && counts.folderCount === 0 && counts.documentCount === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('deleteModal.title', 'Delete "{{name}}"?', { name: folder?.name })}
      size="sm"
      footer={
        <>
          <Button variant="ghost" className="min-h-11" onClick={onClose} disabled={del.isPending}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button variant="danger" className="min-h-11" onClick={handleConfirm} loading={del.isPending} disabled={checking}>
            {t('deleteModal.confirm', 'Move to Bin')}
          </Button>
        </>
      }
    >
      {checking ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
          {counts?.failed ? (
            <p>{t('deleteModal.countFailed', 'This folder and everything inside it will move to the Bin.')}</p>
          ) : isEmpty ? (
            <p>{t('deleteModal.emptyNotice', 'This folder is empty. It will move to the Bin.')}</p>
          ) : (
            <>
              <p className="font-medium text-neutral-800 dark:text-neutral-200">
                {t('deleteModal.binNotice', 'This folder and everything inside it will move to the Bin:')}
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {counts?.folderCount > 0 && (
                  <li>
                    {counts.folderCount === 1
                      ? t('deleteModal.subfolders_one', '{{count}} folder inside it', { count: counts.folderCount })
                      : t('deleteModal.subfolders_other', '{{count}} folders inside it', { count: counts.folderCount })}
                  </li>
                )}
                {counts?.documentCount > 0 && (
                  <li>
                    {counts.documentCount === 1
                      ? t('common:units.document_one', '{{count}} document', { count: counts.documentCount })
                      : t('common:units.document_other', '{{count}} documents', { count: counts.documentCount })}
                    {counts.fileCount > 0 && (
                      <>
                        {' ('}
                        {counts.fileCount === 1
                          ? t('common:units.file_one', '{{count}} file', { count: counts.fileCount })
                          : t('common:units.file_other', '{{count}} files', { count: counts.fileCount })}
                        {')'}
                      </>
                    )}
                  </li>
                )}
              </ul>
            </>
          )}
          <p className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/60">
            {t('deleteModal.restoreHint', 'Nothing is lost — you can bring it all back from the Bin any time.')}{' '}
            <Link to="/bin" onClick={onClose} className="font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-400">
              {t('deleteModal.openBin', 'Open the Bin')}
            </Link>
          </p>
        </div>
      )}
    </Modal>
  );
}
