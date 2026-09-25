import { useTranslation } from 'react-i18next';
import { ArrowLeft, Folder } from 'lucide-react';
import { useFolderPath } from '@/features/documents/useFolderPath.js';

/**
 * Title row for the add/edit forms: a back arrow, the page title and — when `folderId` is given or
 * `showWhere` — a small "Saving in: Shared › Papa" line so it's clear where the new thing goes.
 */
export default function AddPageHeader({ title, folderId, onBack, showWhere = true }) {
  const { t } = useTranslation(['documents', 'common']);
  const where = useFolderPath(folderId);

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
      <div className="min-w-0 pt-1">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 sm:text-2xl">{title}</h1>
        {showWhere && where.label && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            <Folder className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{t('add.savingIn', 'Saving in: {{place}}', { place: where.label })}</span>
          </p>
        )}
      </div>
    </div>
  );
}
