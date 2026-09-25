import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Drawer from '@/components/ui/Drawer.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import { useCreateFolder, useUpdateFolder } from './foldersHooks.js';
import { folderName } from './folderTreeUtils.js';

/**
 * Create or rename a folder — a folder is just a name. `folder` present = rename mode.
 * Create mode: `parentId` is where the new folder goes ('root' or a folder id);
 * `parentName` (optional) is shown in the title so it's clear the folder goes INSIDE it.
 */
export default function FolderFormModal({ isOpen, onClose, parentId, parentName, folder, onSaved }) {
  const { t } = useTranslation(['browse', 'common']);
  const isEdit = Boolean(folder);
  const [name, setName] = useState('');
  const create = useCreateFolder();
  const update = useUpdateFolder();
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (isOpen) setName(folder ? folderName(folder, t) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, folder]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      let saved;
      if (isEdit) {
        saved = await update.mutateAsync({ id: folder.id, name: trimmed });
        toast.success(t('formModal.toastRenamed', 'Folder renamed'));
      } else {
        saved = await create.mutateAsync({ name: trimmed, parentId: parentId || 'root' });
        toast.success(t('formModal.toastCreated', 'Folder created'));
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('formModal.toastFailed', 'Could not save the folder'));
    }
  };

  let title = t('formModal.titleNew', 'New folder');
  if (isEdit) title = t('formModal.titleEdit', 'Rename folder');
  else if (parentName) title = t('formModal.titleNewInside', 'New folder inside “{{name}}”', { name: parentName });

  return (
    <Drawer
      side="right"
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="w-full pb-[env(safe-area-inset-bottom)]">
          <Button block className="min-h-11" onClick={handleSubmit} loading={saving} disabled={!name.trim()}>
            {isEdit ? t('common:actions.save', 'Save') : t('common:actions.create', 'Create')}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <Input
          label={t('formModal.nameLabel', 'Folder name')}
          autoFocus
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('formModal.namePlaceholder', 'e.g. Papa')}
        />
      </form>
    </Drawer>
  );
}
