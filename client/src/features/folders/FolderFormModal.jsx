import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import { FOLDER_COLORS, FOLDER_ICONS, DEFAULT_FOLDER_ICON } from './folderTreeUtils.js';
import { useCreateFolder, useUpdateFolder } from './foldersHooks.js';

/**
 * Create or rename/re-style a folder. `folder` present = edit mode (name,
 * color, icon are editable in place — `parentId`/move lives in `FolderPicker`
 * instead so it isn't duplicated across two flows).
 */
export default function FolderFormModal({ isOpen, onClose, parentId, folder, onSaved }) {
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
      if (isEdit) {
        await update.mutateAsync({ id: folder.id, name: name.trim(), color, icon });
        toast.success('Folder updated');
      } else {
        await create.mutateAsync({ name: name.trim(), parentId: parentId || 'root', color, icon });
        toast.success('Folder created');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save the folder');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Rename folder' : 'New folder'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!name.trim()}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Folder name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Insurance"
        />

        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">Color</p>
          <div className="flex flex-wrap gap-2">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-neutral-900 dark:border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">Icon</p>
          <div className="flex flex-wrap gap-2">
            {FOLDER_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                aria-label={`Icon ${ic}`}
                onClick={() => setIcon(ic)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-base ${
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
