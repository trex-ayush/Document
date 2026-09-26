import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFolderTree } from '@/features/folders/foldersHooks.js';
import { folderName, folderPath, ROOT_ID } from '@/features/folders/folderTreeUtils.js';

/**
 * Where something lives (or will be saved), from the cached folder tree — no extra request.
 * An empty `folderId` means the family's Shared folder (where the server puts anything added
 * without a folder).
 *
 * @returns {{ path: {id: string, name: string}[], label: string, sharedFolderId: string|null }}
 *   `label` is "Shared › Papa" style ('' while the tree loads for a specific folder).
 */
export function useFolderPath(folderId) {
  const { t } = useTranslation('browse');
  const { data } = useFolderTree();

  return useMemo(() => {
    const folders = data?.items || [];
    const shared = folders.find((f) => f.isSystem) || null;
    const targetId = folderId && folderId !== ROOT_ID ? folderId : shared?.id;
    const path = folderPath(folders, targetId).map((f) => ({ id: f.id, name: folderName(f, t) }));
    return {
      path,
      label: path.map((p) => p.name).join(' › ') || (folderId ? '' : t('browse:sharedFolder', 'Shared')),
      sharedFolderId: shared?.id || null,
    };
  }, [data, folderId, t]);
}
