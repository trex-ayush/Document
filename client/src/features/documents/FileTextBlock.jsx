import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Pencil } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import Textarea from '@/components/ui/Textarea.jsx';
import CopyButton from '@/features/items/CopyButton.jsx';
import TextLines from './TextLines.jsx';
import { useUpdateFileText } from './documentsHooks.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

/** Same limit as the server (it cuts anything longer). */
const FILE_TEXT_MAX = 20000;

/**
 * "Text read from this file" beside (wide screens) or under (phones) a file on the document page:
 * a header with Copy all and Edit text, then the text line by line with a copy button on each
 * line (TextLines, first 5 rows until "Show all"). With no text, editors can still add some.
 *
 * Props: text, onEdit? (omit for read-only members), className?
 */
export function FileTextPanel({ text, onEdit, className = '' }) {
  const { t } = useTranslation('documents');
  if (!text && !onEdit) return null;
  const editLabel = text ? t('fileText.edit', 'Edit text') : t('fileText.add', 'Add text');
  const editButton = onEdit && (
    <Tooltip content={text ? t('tip.editText', 'Edit text') : t('tip.addText', 'Add text')}>
      <button
        type="button"
        onClick={onEdit}
        aria-label={editLabel}
        className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </button>
    </Tooltip>
  );
  return (
    <section className={`min-w-0 px-4 py-2 sm:px-5 ${className}`} aria-label={t('fileText.heading', 'Text read from this file')}>
      <div className="-mr-2 flex items-center gap-1">
        <h3 className="min-w-0 flex-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">{t('fileText.heading', 'Text read from this file')}</h3>
        {text && <CopyButton value={text} label={t('fileText.copyAll', 'Copy all text')} tip={t('tip.copyAllText', 'Copy all')} />}
        {editButton}
      </div>
      {text ? (
        <TextLines text={text} />
      ) : (
        <p className="pb-2 text-sm text-neutral-500 dark:text-neutral-400">{t('fileText.none', 'No text was read from this file.')}</p>
      )}
    </section>
  );
}

/**
 * Drawer to correct (or clear) the text read from one file. Saves with
 * PATCH /documents/:id/files/:fileId/text.
 *
 * Props: documentId, file ({ id, text, label, originalName } | null = closed), onClose
 */
export function FileTextEditor({ documentId, file, onClose }) {
  const { t } = useTranslation(['documents', 'common']);
  const save = useUpdateFileText(documentId);
  const [draft, setDraft] = useState(null);
  const value = draft ?? file?.text ?? '';

  const close = () => {
    setDraft(null);
    onClose();
  };

  const handleSave = async () => {
    try {
      await save.mutateAsync({ fileId: file.id, text: value });
      toast.success(t('fileText.saved', 'Text saved'));
      close();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('fileText.saveFailed', 'Could not save the text'));
    }
  };

  return (
    <Drawer
      isOpen={Boolean(file)}
      onClose={close}
      side="right"
      size="md"
      title={t('fileText.editTitle', 'Text read from “{{name}}”', { name: file?.label || file?.originalName || '' })}
      description={t('fileText.editHint', 'Fix any words the app read wrongly. Search uses this text.')}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={save.isPending}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} loading={save.isPending}>
            {t('common:actions.save', 'Save')}
          </Button>
        </>
      }
    >
      <Textarea
        label={t('fileText.heading', 'Text read from this file')}
        rows={14}
        maxLength={FILE_TEXT_MAX}
        value={value}
        onChange={(e) => setDraft(e.target.value)}
      />
    </Drawer>
  );
}
