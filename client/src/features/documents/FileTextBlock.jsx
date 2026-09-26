import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Pencil } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import Textarea from '@/components/ui/Textarea.jsx';
import CollapsibleText from '@/features/items/CollapsibleText.jsx';
import CopyButton from '@/features/items/CopyButton.jsx';
import { useUpdateFileText } from './documentsHooks.js';

/** Same limit as the server (it cuts anything longer). */
const FILE_TEXT_MAX = 20000;

/**
 * "Text read from this file" on a file card of the document page: the text cut to 3 lines with
 * "Show all (N)", a Copy button and, for members who can edit, "Edit text". Nothing when the file
 * has no text.
 *
 * Props: text, onEdit? (omit for read-only members)
 */
export function FileTextBlock({ text, onEdit }) {
  const { t } = useTranslation('documents');
  if (!text) return null;
  return (
    <div className="border-t border-neutral-100 px-3 pb-1 pt-2 dark:border-neutral-700">
      <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{t('fileText.heading', 'Text read from this file')}</p>
      {/* Copy and Edit share the "Show all" row, so the narrow phone tiles stay tidy. */}
      <CollapsibleText
        text={text}
        className="mt-0.5 text-xs leading-5 text-neutral-700 dark:text-neutral-300"
        actions={
          <>
            <CopyButton value={text} label={t('fileText.copy', 'Copy text')} />
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={t('fileText.edit', 'Edit text')}
                title={t('fileText.edit', 'Edit text')}
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        }
      />
    </div>
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
