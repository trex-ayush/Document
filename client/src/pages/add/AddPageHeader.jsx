import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import FolderPicker from '@/features/folders/FolderPicker.jsx';
import { useFolderPath } from '@/features/documents/useFolderPath.js';

/**
 * Title row for the add/edit forms — the standard `PageHeader` with its back arrow, and — when
 * `folderId` is given or `showWhere` — where the new thing goes ("Shared › Papa") as the subtitle.
 *
 * With `onFolderChange`, that line becomes "Save in: 📁 Shared › Papa [Change]": Change opens the
 * folder picker drawer and calls `onFolderChange(folderId)` with the chosen folder. Without it the
 * line is read-only ("Saving in: …").
 */
export default function AddPageHeader({ title, folderId, onBack, showWhere = true, onFolderChange }) {
  const { t } = useTranslation(['documents', 'common']);
  const where = useFolderPath(folderId);
  const [pickerOpen, setPickerOpen] = useState(false);

  let subtitle = null;
  if (showWhere && onFolderChange) {
    subtitle = (
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex-shrink-0">{t('add.saveIn', 'Save in:')}</span>
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-neutral-800 dark:text-neutral-100">
          <Folder className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{where.label}</span>
        </span>
        <Button type="button" variant="link" className="ml-1 flex-shrink-0 font-semibold" onClick={() => setPickerOpen(true)}>
          {t('add.changeFolder', 'Change')}
        </Button>
      </span>
    );
  } else if (showWhere && where.label) {
    subtitle = (
      <span className="flex items-center gap-1.5">
        <Folder className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{t('add.savingIn', 'Saving in: {{place}}', { place: where.label })}</span>
      </span>
    );
  }

  return (
    <>
      <PageHeader title={title} onBack={onBack} subtitle={subtitle} />
      {onFolderChange && (
        <FolderPicker
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          initialFolderId={folderId || where.sharedFolderId}
          title={t('add.pickerTitle', 'Save in…')}
          confirmLabel={t('add.pickerConfirm', 'Save here')}
          onPick={(id) => onFolderChange(id === where.sharedFolderId ? null : id)}
        />
      )}
    </>
  );
}
