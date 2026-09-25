import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import { FOLDER_COLORS, FOLDER_ICONS, DEFAULT_FOLDER_ICON } from './folderTreeUtils.js';
import { useCreateFolder, useUpdateFolder } from './foldersHooks.js';

/**
 * Create or rename/re-style a folder. `folder` present = edit mode (name,
 * color, icon are editable in place — `parentId`/move lives in `FolderPicker`
 * instead so it isn't duplicated across two flows).
 *
 * Create mode: `parentId` is where the new folder goes ('root' or a folder id — any depth);
 * `parentName` (optional) is shown in the title so it's clear the folder goes INSIDE it.
 */
export default function FolderFormModal({ isOpen, onClose, parentId, parentName, folder, onSaved }) {
  const { t } = useTranslation(['browse', 'common']);
  const isEdit = Boolean(folder);
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_COLORS[0]);
  const [icon, setIcon] = useState(DEFAULT_FOLDER_ICON);
  const create = useCreateFolder();
  const update = useUpdateFolder();
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!isOpen) return;
    setName(folder?.name || '');
    setColor(folder?.color || FOLDER_COLORS[0]);
    setIcon(folder?.icon || DEFAULT_FOLDER_ICON);
  }, [isOpen, folder]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      let saved;
      if (isEdit) {
        saved = await update.mutateAsync({ id: folder.id, name: name.trim(), color, icon });
        toast.success(
          name.trim() !== folder.name
            ? t('formModal.toastRenamed', 'Folder renamed')
            : t('formModal.toastUpdated', 'Folder updated'),
        );
      } else {
        saved = await create.mutateAsync({ name: name.trim(), parentId: parentId || 'root', color, icon });
        toast.success(t('formModal.toastCreated', 'Folder created'));
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('formModal.toastFailed', 'Could not save the folder'));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEdit
          ? t('formModal.titleEdit', 'Rename folder')
          : parentName
            ? t('formModal.titleNewInside', 'New folder inside “{{name}}”', { name: parentName })
            : t('formModal.titleNew', 'New folder')
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('common:actions.cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!name.trim()}>
            {isEdit ? t('common:actions.save', 'Save') : t('common:actions.create', 'Create')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('formModal.nameLabel', 'Folder name')}
          autoFocus
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('formModal.namePlaceholder', 'e.g. Insurance')}
        />

        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('formModal.colorLabel', 'Color')}</p>
          <div className="flex flex-wrap gap-2">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t('formModal.colorAria', 'Color {{color}}', { color: c })}
                onClick={() => setColor(c)}
                className={`h-11 w-11 rounded-full border-2 ${color === c ? 'border-neutral-900 dark:border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('formModal.iconLabel', 'Icon')}</p>
          <div className="flex flex-wrap gap-2">
            {FOLDER_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                aria-label={t('formModal.iconAria', 'Icon {{icon}}', { icon: ic })}
                onClick={() => setIcon(ic)}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border text-base ${
                  icon === ic
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-neutral-200 dark:border-neutral-700'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
