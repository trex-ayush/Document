import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Folder } from 'lucide-react';
import { FIELD_BORDER, FIELD_CONTROL, FIELD_LABEL, KIND_ICON } from '@/components/ui/tokens.js';
import Tooltip from '@/components/ui/Tooltip.jsx';
import { InfoTip } from '@/components/ui/FormField.jsx';
import { useFolderPath } from '@/features/documents/useFolderPath.js';
import FolderPicker from './FolderPicker.jsx';

/**
 * FolderField — "Save in folder" on the add forms: a labelled box the same size as an Input,
 * showing the chosen folder path ("Shared › Papa") with "Change ›" on the right. The whole box
 * is one button that opens the folder picker drawer ("Save in…" / "Save here").
 *
 * Props: folderId (null = the family's Shared folder), onChange(folderId | null), label?
 */
export default function FolderField({ folderId, onChange, label }) {
  const { t } = useTranslation(['documents', 'common']);
  const where = useFolderPath(folderId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fieldLabel = label ?? t('add.saveInFolder', 'Save in folder');
  const place = where.label || '…';

  return (
    <div>
      <div className={`${FIELD_LABEL.replace('block', 'flex')} items-center gap-1.5`}>
        <span aria-hidden="true">{fieldLabel}</span>
        <InfoTip text={t('common:tip.saveInFolderInfo', 'The folder where this will be kept')} />
      </div>
      <Tooltip content={t('common:tip.pickFolder', 'Pick a different folder')} className="grid">
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-label={t('add.saveInFolderAria', 'Save in folder: {{place}}. Change', { place })}
        className={`flex items-center gap-3 text-left hover:border-neutral-400 hover:bg-neutral-50 focus-visible:ring-3 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 ${FIELD_CONTROL} ${FIELD_BORDER}`}
      >
        <Folder className={`h-6 w-6 flex-shrink-0 ${KIND_ICON.folder}`} strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-neutral-900 dark:text-neutral-100">{place}</span>
        <span className="flex flex-shrink-0 items-center gap-0.5 font-medium text-primary-600 dark:text-primary-400">
          {t('add.changeFolder', 'Change')}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
      </Tooltip>
      <FolderPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialFolderId={folderId || where.sharedFolderId}
        title={t('add.pickerTitle', 'Save in…')}
        confirmLabel={t('add.pickerConfirm', 'Save here')}
        onPick={(id) => onChange(id === where.sharedFolderId ? null : id)}
      />
    </div>
  );
}
