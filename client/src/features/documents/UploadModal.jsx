import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Textarea from '@/components/ui/Textarea.jsx';
import { FileDropzone, UploadProgressList } from '@/components/ui/FileDropzone.jsx';
import TagChip from '@/components/ui/TagChip.jsx';
import FolderPicker from '@/features/folders/FolderPicker.jsx';
import { useFolderTree } from '@/features/folders/foldersHooks.js';
import { folderPath, ROOT_ID } from '@/features/folders/folderTreeUtils.js';
import LocalCustomFieldsEditor from './LocalCustomFieldsEditor.jsx';
import ResizeTool from '@/features/resize/ResizeTool.jsx';
import { autoRotateImageFile } from './exifRotate.js';
import { useCreateDocument, useAddFiles, useDocumentTypes, useMembers } from './documentsHooks.js';
import { useDocumentScan } from '@/features/scan/useDocumentScan.js';
import ScanStatus from '@/features/scan/ScanStatus.jsx';
import { Camera, Minimize2, X } from 'lucide-react';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf';
const MAX_FILE_BYTES = 25 * 1024 * 1024;

let queueSeq = 0;

/**
 * Upload flow, folded into Browse's own state rather than a separate route
 * (this agent's call, per the build plan — "fold upload into Browse's own
 * state"). Two modes:
 *  - `create` (default): full new-document form — title/folder/type/member/
 *    tags/notes/expiry + custom fields + files. `POST /documents` (multipart).
 *  - `append`: just files+labels onto an existing document (`documentId`).
 *    `POST /documents/:id/files`. Used by `DocumentDetail`'s "Add files".
 *
 * Handles the FAB's `?upload=1`/`?upload=1&capture=1` query params — Browse
 * opens this in `create` mode and, when `capture` is set, auto-triggers the
 * camera input on mount.
 */
export default function UploadModal({
  isOpen,
  onClose,
  mode = 'create',
  documentId,
  defaultFolderId = null,
  defaultMemberId = '',
  autoCapture = false,
  onCreated,
  onAppended,
}) {
  const { t } = useTranslation(['documents', 'common']);
  const [queue, setQueue] = useState([]); // [{ id, file, label }]
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState(defaultFolderId);
  const [typeId, setTypeId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [notes, setNotes] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [customFields, setCustomFields] = useState([]);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [resizeTarget, setResizeTarget] = useState(null); // queue item id
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const cameraInputRef = useRef(null);
  const { data: typesData } = useDocumentTypes({ enabled: isOpen && mode === 'create' });
  const { data: membersData } = useMembers({ enabled: isOpen && mode === 'create' });
  const { data: treeData } = useFolderTree({ enabled: isOpen && mode === 'create' });
  const createDoc = useCreateDocument();
  const addFiles = useAddFiles(documentId);

  useEffect(() => {
    if (!isOpen) return;
    setQueue([]);
    setTitle('');
    setFolderId(defaultFolderId);
    setTypeId('');
    setMemberId(defaultMemberId || '');
    setTagsText('');
    setNotes('');
    setExpiryDate('');
    setCustomFields([]);
    setProgress(0);
    if (autoCapture) {
      // Let the modal paint first, then open the camera picker.
      setTimeout(() => cameraInputRef.current?.click(), 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const folderName = (() => {
    if (!folderId) return null;
    const path = folderPath(treeData?.items || [], folderId);
    return path.length ? path[path.length - 1].name : null;
  })();

  const addFilesToQueue = async (files) => {
    const rotated = await Promise.all(Array.from(files).map((f) => autoRotateImageFile(f)));
    setQueue((prev) => [
      ...prev,
      ...rotated.map((file) => ({ id: `q${queueSeq++}`, file, label: file.name.replace(/\.[^./\\]+$/, '') })),
    ]);
  };

  const handleDropzoneFiles = (accepted, rejected) => {
    rejected.forEach(({ file, reasons }) => {
      const reason = reasons.includes('file-too-large')
        ? t('upload.fileTooLarge', 'file too large')
        : t('upload.unsupportedFileType', 'unsupported file type');
      toast.error(`${file.name}: ${reason}`);
    });
    if (accepted.length) addFilesToQueue(accepted);
  };

  const handleCameraChange = (e) => {
    const files = e.target.files;
    if (files?.length) addFilesToQueue(files);
    e.target.value = '';
  };

  const updateLabel = (id, label) => setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, label } : q)));
  const removeQueued = (id) => setQueue((prev) => prev.filter((q) => q.id !== id));

  const handleTypeChange = (id) => {
    setTypeId(id);
    const type = (typesData?.items || []).find((dt) => dt.id === id);
    if (!type) return;
    if (type.defaultFolderId && folderId === defaultFolderId) setFolderId(type.defaultFolderId);
    if (type.fields?.length) {
      setCustomFields((prev) => {
        const existingKeys = new Set(prev.map((f) => f.key));
        const additions = type.fields
          .filter((f) => !existingKeys.has(f.key))
          .map((f) => ({ key: f.key, type: f.type || 'text', sensitive: Boolean(f.sensitive), value: '' }));
        return [...prev, ...additions];
      });
    }
  };

  // Silent in-browser auto-fill from queued photos/PDFs: fills only empty fields, never blocks saving.
  const scan = useDocumentScan({
    enabled: isOpen && mode === 'create',
    queue,
    types: typesData?.items,
    form: { title, typeId, expiryDate, customFields },
    actions: { setTitle, setExpiryDate, setCustomFields, onTypeChange: handleTypeChange },
  });

  const handleResizeResult = (file, label) => {
    setQueue((prev) => prev.map((q) => (q.id === resizeTarget ? { ...q, file, label: label || q.label } : q)));
    setResizeTarget(null);
  };

  // No folder (or the picker's "root") = top level — a family may have no folders at all yet.
  const canSubmit = mode === 'append' ? queue.length > 0 : title.trim() && queue.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    scan.cancel(); // save what's in the form now; a late scan result must not change it
    setSubmitting(true);
    setProgress(0);
    const onUploadProgress = (evt) => {
      if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
    };
    try {
      if (mode === 'append') {
        await addFiles.mutateAsync({
          payload: { files: queue.map((q) => q.file), labels: queue.map((q) => q.label) },
          onUploadProgress,
        });
        toast.success(t('upload.toasts.filesAdded', 'Files added'));
        onAppended?.();
      } else {
        const tags = tagsText.split(',').map((s) => s.trim()).filter(Boolean);
        const data = {
          title: title.trim(),
          folderId: folderId && folderId !== ROOT_ID ? folderId : null,
          typeId: typeId || undefined,
          memberId: memberId || undefined,
          tags,
          notes: notes || undefined,
          expiryDate: expiryDate || undefined,
          customFields: customFields.filter((f) => f.key.trim()).map((f) => ({ ...f, key: f.key.trim() })),
        };
        const created = await createDoc.mutateAsync({
          payload: { data, files: queue.map((q) => q.file), labels: queue.map((q) => q.label) },
          onUploadProgress,
        });
        toast.success(t('upload.toasts.documentUploaded', 'Document uploaded'));
        onCreated?.(created);
      }
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('upload.toasts.uploadFailed', 'Upload failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const progressItems = queue.map((q) => ({
    id: q.id,
    name: q.label || q.file.name,
    progress,
    status: submitting ? (progress >= 100 ? 'done' : 'uploading') : undefined,
  }));

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={submitting ? () => {} : onClose}
        title={mode === 'append' ? t('upload.addFiles', 'Add files') : t('upload.titleCreate', 'Upload document')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>{t('common:actions.cancel', 'Cancel')}</Button>
            <Button onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>
              {mode === 'append' ? t('upload.addFiles', 'Add files') : t('common:actions.upload', 'Upload')}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {mode === 'create' && (
            <>
              <Input label={t('upload.docTitleLabel', 'Title')} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('upload.titlePlaceholder', 'e.g. Aadhaar Card')} />

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('upload.folderLabel', 'Folder')}</label>
                <Button type="button" variant="secondary" size="sm" onClick={() => setFolderPickerOpen(true)}>
                  {folderName || t('upload.noFolder', 'No folder (top level)')}
                </Button>
                {!folderName && <p className="mt-1 text-xs text-neutral-400">{t('upload.folderOptional', 'Optional — you can move it into a folder later.')}</p>}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('upload.documentTypeLabel', 'Document type')}</label>
                  <select value={typeId} onChange={(e) => handleTypeChange(e.target.value)} className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
                    <option value="">{t('upload.noneOption', 'None')}</option>
                    {(typesData?.items || []).map((dt) => <option key={dt.id} value={dt.id}>{dt.icon ? `${dt.icon} ` : ''}{dt.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('upload.familyMemberLabel', 'Family member')}</label>
                  <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
                    <option value="">{t('common:people.shared', 'Shared (whole family)')}</option>
                    {(membersData?.items || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <Input label={t('upload.tagsLabel', 'Tags')} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder={t('upload.tagsPlaceholder', 'tax-2025, insurance (comma separated)')} />
              {tagsText.trim() && (
                <div className="flex flex-wrap gap-1.5">
                  {tagsText.split(',').map((s) => s.trim()).filter(Boolean).map((s) => <TagChip key={s} tag={{ name: s }} />)}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label={t('upload.expiryDateLabel', 'Expiry date')} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>

              <Textarea label={t('upload.notesLabel', 'Notes')} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('upload.customFieldsHeading', 'Custom fields')}</p>
                <LocalCustomFieldsEditor fields={customFields} onChange={setCustomFields} />
              </div>
            </>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('upload.filesHeading', 'Files')}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <FileDropzone
                className="flex-1"
                onFilesSelected={handleDropzoneFiles}
                accept={ACCEPT}
                maxSize={MAX_FILE_BYTES}
                hint={t('upload.dropzoneHint', 'PDF or image, up to 25MB each')}
              />
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-3 text-sm font-medium text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-300 sm:flex-col sm:py-10"
              >
                <Camera className="h-6 w-6" />
                {t('common:fab.takePhoto', 'Take photo')}
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCameraChange}
                className="sr-only"
              />
            </div>

            {queue.length > 0 && (
              <ul className="mt-3 space-y-2">
                {queue.map((q) => (
                  <li key={q.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
                    {q.file.type.startsWith('image/') ? (
                      <img src={URL.createObjectURL(q.file)} alt="" className="h-10 w-10 flex-shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-neutral-100 text-xs text-neutral-500 dark:bg-neutral-700">PDF</div>
                    )}
                    <Input value={q.label} onChange={(e) => updateLabel(q.id, e.target.value)} className="flex-1" placeholder={t('upload.fileLabelPlaceholder', 'Label')} />
                    {q.file.type.startsWith('image/') && (
                      <button type="button" onClick={() => setResizeTarget(q.id)} title={t('upload.resizeCompressTitle', 'Resize / compress')} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700">
                        <Minimize2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                    <button type="button" onClick={() => removeQueued(q.id)} aria-label={t('common:actions.remove', 'Remove')} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                      <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <ScanStatus scanning={scan.scanning} />
            {submitting && <UploadProgressList items={progressItems} className="mt-2" />}
          </div>
        </div>
      </Modal>

      <FolderPicker
        isOpen={folderPickerOpen}
        onClose={() => setFolderPickerOpen(false)}
        onPick={setFolderId}
        initialFolderId={folderId}
        title={t('upload.chooseFolderTitle', 'Choose a folder')}
      />

      <ResizeTool
        isOpen={Boolean(resizeTarget)}
        onClose={() => setResizeTarget(null)}
        file={queue.find((q) => q.id === resizeTarget)?.file}
        mode="standalone"
        onResult={handleResizeResult}
      />
    </>
  );
}
