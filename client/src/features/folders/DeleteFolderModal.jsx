import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Drawer from '@/components/ui/Drawer.jsx';
import Button from '@/components/ui/Button.jsx';
import { Notice } from '@/components/ui/PageState.jsx';
import { Skeleton } from '@/components/ui/Skeleton.jsx';
import { foldersApi } from '@/services/foldersApi.js';
import { useDeleteFolder } from './foldersHooks.js';
import { folderName } from './folderTreeUtils.js';

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

  const hasCounts = counts && !counts.failed && (counts.folderCount > 0 || counts.documentCount > 0);

  return (
    <Drawer
      side="right"
      isOpen={isOpen}
      onClose={onClose}
      title={t('deleteModal.title', 'Delete "{{name}}"?', { name: folderName(folder, t) })}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={del.isPending}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={del.isPending} disabled={checking}>
            {t('deleteModal.confirm', 'Move to Bin')}
          </Button>
        </>
      }
    >
      {checking ? (
        <div className="space-y-3" aria-hidden="true">
          <Skeleton variant="line" height={14} width="85%" />
          <Skeleton variant="line" width="45%" />
          <Skeleton height={64} width="100%" />
        </div>
      ) : (
        <div className="space-y-4 text-sm text-neutral-700 dark:text-neutral-300">
          <p className="font-medium text-neutral-900 dark:text-neutral-100">
            {t('deleteModal.binNotice', 'This folder and everything inside it will move to the Bin.')}
          </p>
          {hasCounts && (
            <ul className="list-disc space-y-1 pl-5">
              {counts.folderCount > 0 && (
                <li>
                  {counts.folderCount === 1
                    ? t('deleteModal.subfolders_one', '{{count}} folder inside it', { count: counts.folderCount })
                    : t('deleteModal.subfolders_other', '{{count}} folders inside it', { count: counts.folderCount })}
                </li>
              )}
              {counts.documentCount > 0 && (
                <li>
                  {counts.documentCount === 1
                    ? t('common:units.document_one', '{{count}} document', { count: counts.documentCount })
                    : t('common:units.document_other', '{{count}} documents', { count: counts.documentCount })}
                </li>
              )}
            </ul>
          )}
          <Notice>
            {t('deleteModal.restoreHint', 'Nothing is lost — you can bring it all back from the Bin any time.')}{' '}
            <Link to="/bin" onClick={onClose} className="font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-400">
              {t('deleteModal.openBin', 'Open the Bin')}
            </Link>
          </Notice>
        </div>
      )}
    </Drawer>
  );
}
