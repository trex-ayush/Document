import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Folder } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import FolderPicker from '@/features/folders/FolderPicker.jsx';
import { useFolderPath } from '@/features/documents/useFolderPath.js';

/**
 * Title row for the add/edit forms: a back arrow, the page title and — when `folderId` is given or
 * `showWhere` — where the new thing goes ("Shared › Papa").
 *
 * With `onFolderChange`, that line becomes "Save in: 📁 Shared › Papa [Change]": Change opens the
 * folder picker drawer and calls `onFolderChange(folderId)` with the chosen folder. Without it the
 * line is read-only ("Saving in: …").
 */
export default function AddPageHeader({ title, folderId, onBack, showWhere = true, onFolderChange }) {
  const { t } = useTranslation(['documents', 'common']);
  const where = useFolderPath(folderId);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="mb-4 flex items-start gap-2 sm:mb-6">
      <button
        type="button"
        onClick={onBack}
        aria-label={t('common:actions.back', 'Back')}
        className="-ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1 pt-1">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 sm:text-2xl">{title}</h1>
        {showWhere && onFolderChange && (
          <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <span className="flex-shrink-0">{t('add.saveIn', 'Save in:')}</span>
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-neutral-800 dark:text-neutral-100">
              <Folder className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{where.label}</span>
            </span>
            <Button type="button" variant="link" size="sm" className="ml-1 flex-shrink-0 font-semibold" onClick={() => setPickerOpen(true)}>
              {t('add.changeFolder', 'Change')}
            </Button>
          </div>
        )}
        {showWhere && !onFolderChange && where.label && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            <Folder className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{t('add.savingIn', 'Saving in: {{place}}', { place: where.label })}</span>
          </p>
        )}
      </div>
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
    </div>
  );
}
