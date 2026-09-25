import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { useFolderPath } from '@/features/documents/useFolderPath.js';

/**
 * Title row for the add/edit forms — the standard `PageHeader` with its back arrow. Choosing the
 * folder happens in the form itself (`FolderField`, the first field); with `showWhere` and a
 * `folderId` this header only shows a read-only "Saving in: Shared › Papa" line.
 */
export default function AddPageHeader({ title, folderId, onBack, showWhere = false }) {
  const { t } = useTranslation(['documents', 'common']);
  const where = useFolderPath(folderId);

  const subtitle =
    showWhere && where.label ? (
      <span className="flex items-center gap-1.5">
        <Folder className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{t('add.savingIn', 'Saving in: {{place}}', { place: where.label })}</span>
      </span>
    ) : null;

  return <PageHeader title={title} onBack={onBack} subtitle={subtitle} />;
}
