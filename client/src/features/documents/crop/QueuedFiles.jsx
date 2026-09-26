import { useTranslation } from 'react-i18next';
import { Crop, FileText, X } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import { ListIcon } from '@/components/ui/ListRow.jsx';

/**
 * The files waiting to be uploaded (from useCropQueue): a thumbnail of the cropped photo (or a
 * file icon), the name, "Finding the page edges…" while auto-crop runs, "Edit crop" for photos
 * and a remove button.
 *
 * Props: queue, onEditCrop(entry), onRemove(id), disabled?, className?
 */
export default function QueuedFiles({ queue, onEditCrop, onRemove, disabled = false, className = '' }) {
  const { t } = useTranslation('documents');
  if (!queue.length) return null;
  return (
    <ul className={`space-y-2 ${className}`}>
      {queue.map((q) => (
        <li key={q.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 py-1 pl-2 pr-1 dark:border-neutral-700">
          {q.previewUrl ? <ListIcon src={q.previewUrl} /> : <ListIcon icon={FileText} kind={q.file.type === 'application/pdf' ? 'pdf' : 'document'} />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-neutral-700 dark:text-neutral-300">{q.file.name}</span>
            {q.detecting && <span className="block text-xs text-neutral-500 dark:text-neutral-400">{t('crop.detecting', 'Finding the page edges…')}</span>}
          </span>
          {q.original && !q.detecting && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEditCrop(q)}
              disabled={disabled}
              leftIcon={<Crop className="h-4 w-4" aria-hidden="true" />}
              aria-label={t('crop.editFor', 'Edit crop of {{name}}', { name: q.file.name })}
            >
              <span className="hidden sm:inline">{t('crop.edit', 'Edit crop')}</span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(q.id)}
            disabled={disabled}
            aria-label={t('add.removeFile', 'Remove {{name}}', { name: q.file.name })}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
