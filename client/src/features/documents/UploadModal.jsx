import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Textarea from '@/components/ui/Textarea.jsx';
import { FileDropzone, UploadProgressList } from '@/components/ui/FileDropzone.jsx';
import ResizeTool from '@/features/resize/ResizeTool.jsx';
import { autoRotateImageFile } from './exifRotate.js';
import { useCreateDocument, useAddFiles, useDocumentTypes } from './documentsHooks.js';
import { useDocumentScan } from '@/features/scan/useDocumentScan.js';
import ScanStatus from '@/features/scan/ScanStatus.jsx';
import { Camera, Minimize2, X } from 'lucide-react';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf';
const TITLE_MAX = 200;
const noop = () => {};

let queueSeq = 0;

const baseName = (name) => String(name || '').replace(/\.[^./\\]+$/, '').trim();

/**
 * Upload flow. Two modes:
 *  - `create` (default): the deliberately tiny new-document form — pick file(s), a title
 *    (auto-filled from the first file's name) and optional notes. `POST /documents`.
 *    Everything else (folder, type, member, tags, expiry, custom fields) is edited later on
 *    the document page. WHERE the document lands comes from where Upload was pressed, never
 *    from a field: pass `folderId`/`folderName` (inside a folder) or `memberId`/`memberName`
 *    (a person's page). Neither = top level, shared with the whole family.
 *  - `append`: just files+labels onto an existing document (`documentId`).
 *    `POST /documents/:id/files`. Used by `DocumentDetail`'s "Add files".
 *
 * `autoCapture` (the FAB's "Take photo") opens the camera input on open.
 */
export default function UploadModal({
  isOpen,
  onClose,
  mode = 'create',
  documentId,
  folderId = null,
  folderName = '',
  memberId = null,
  memberName = '',
  autoCapture = false,
  onCreated,
  onAppended,
}) {
  const { t } = useTranslation(['documents', 'common']);
  const isCreate = mode === 'create';
  const [queue, setQueue] = useState([]); // [{ id, file, label }]
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [resizeTarget, setResizeTarget] = useState(null); // queue item id (append mode)
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Who wrote the title: the user typing wins over the scan, which wins over the file name.
  const titleTypedRef = useRef(false);
  const titleFromScanRef = useRef(false);

  const cameraInputRef = useRef(null);
  // Only used to name a recognised ID document the way this family names it (e.g. "Aadhaar Card").
  const { data: typesData } = useDocumentTypes({ enabled: isOpen && isCreate });
  const createDoc = useCreateDocument();
  const addFiles = useAddFiles(documentId);

  useEffect(() => {
    if (!isOpen) return;
    setQueue([]);
    setTitle('');
    setNotes('');
    setProgress(0);
    titleTypedRef.current = false;
    titleFromScanRef.current = false;
    if (autoCapture) {
      // Let the modal paint first, then open the camera picker.
      setTimeout(() => cameraInputRef.current?.click(), 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Title follows the first chosen file's name until the user (or the scan) sets one.
  const firstQueued = queue[0];
  useEffect(() => {
    if (!isCreate) return;
    if (!firstQueued) titleFromScanRef.current = false;
    if (titleTypedRef.current || titleFromScanRef.current) return;
    setTitle(firstQueued ? baseName(firstQueued.file.name).slice(0, TITLE_MAX) : '');
  }, [isCreate, firstQueued]);

  const handleTitleChange = (e) => {
    titleTypedRef.current = e.target.value.trim() !== '';
    setTitle(e.target.value);
  };

  // Silent in-browser reading of the chosen photo/PDF. With the short form, the only thing it
  // may fill is the visible title (e.g. "Aadhaar Card") — and only while the user hasn't typed
  // one. Type/field/expiry values it reads are dropped, never saved behind the user's back.
  const scan = useDocumentScan({
    enabled: isOpen && isCreate,
    queue,
    types: typesData?.items,
    form: { title: titleTypedRef.current ? title : '', typeId: '', expiryDate: '', customFields: [] },
    actions: {
      setTitle: (update) => {
        if (titleTypedRef.current) return;
        const next = typeof update === 'function' ? update('') : update;
        if (!String(next || '').trim()) return;
        titleFromScanRef.current = true;
        setTitle(String(next).slice(0, TITLE_MAX));
      },
      setExpiryDate: noop,
      setCustomFields: noop,
      onTypeChange: noop,
    },
  });

  const addFilesToQueue = async (files) => {
    const rotated = await Promise.all(Array.from(files).map((f) => autoRotateImageFile(f)));
    setQueue((prev) => [
      ...prev,
      ...rotated.map((file) => ({ id: `q${queueSeq++}`, file, label: baseName(file.name) })),
    ]);
  };

  const handleDropzoneFiles = (accepted, rejected) => {
    rejected.forEach(({ file }) => {
      toast.error(`${file.name}: ${t('upload.unsupportedFileType', 'unsupported file type')}`);
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

  const handleResizeResult = (file, label) => {
    setQueue((prev) => prev.map((q) => (q.id === resizeTarget ? { ...q, file, label: label || q.label } : q)));
    setResizeTarget(null);
  };

  // Plain-words destination, shown as the sheet title and in the success toast.
  const destination = folderId
    ? {
      title: folderName
        ? t('upload.titleToFolder', 'Upload to the “{{name}}” folder', { name: folderName })
        : t('upload.titleToThisFolder', 'Upload to this folder'),
      done: folderName
        ? t('upload.toasts.uploadedToFolder', 'Uploaded to the “{{name}}” folder', { name: folderName })
        : t('upload.toasts.uploadedToThisFolder', 'Uploaded to the folder'),
    }
    : memberId
      ? {
        title: t('upload.titleForMember', 'Upload for {{name}}', { name: memberName || t('upload.thisPerson', 'this person') }),
        done: t('upload.toasts.uploadedForMember', 'Uploaded for {{name}}', { name: memberName || t('upload.thisPerson', 'this person') }),
      }
      : {
        title: t('upload.titleShared', 'Upload — shared with the whole family'),
        done: t('upload.toasts.uploadedShared', 'Uploaded — shared with the whole family'),
      };

  const canSubmit = isCreate ? title.trim() && queue.length > 0 : queue.length > 0;

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
        const data = {
          title: title.trim(),
          folderId: folderId || null,
          memberId: memberId || null,
          notes: notes.trim() || undefined,
        };
        const created = await createDoc.mutateAsync({
          payload: { data, files: queue.map((q) => q.file), labels: queue.map((q) => q.label) },
          onUploadProgress,
        });
        toast.success(destination.done);
        onCreated?.(created);
      }
      onClose();
    } catch (err) {
      const tooBig = err?.response?.data?.code === 'FILE_TOO_LARGE';
      toast.error(
        tooBig
          ? t('upload.toasts.fileTooBig', 'This file is too big to upload. Try a smaller photo or PDF.')
          : err?.response?.data?.message || t('upload.toasts.uploadFailed', 'Upload failed'),
      );
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
        title={isCreate ? destination.title : t('upload.addFiles', 'Add files')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" className="min-h-11" onClick={onClose} disabled={submitting}>{t('common:actions.cancel', 'Cancel')}</Button>
            <Button className="min-h-11" onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>
              {isCreate ? t('common:actions.upload', 'Upload') : t('upload.addFiles', 'Add files')}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <FileDropzone
                className="flex-1"
                onFilesSelected={handleDropzoneFiles}
                accept={ACCEPT}
                hint={t('upload.dropzoneHintPlain', 'PDF or photo')}
              />
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-3 text-sm font-medium text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-300 sm:flex-col sm:py-10"
              >
                <Camera className="h-6 w-6" aria-hidden="true" />
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
                    {isCreate ? (
                      <span className="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-200">{q.file.name}</span>
                    ) : (
                      <Input value={q.label} onChange={(e) => updateLabel(q.id, e.target.value)} className="flex-1" placeholder={t('upload.fileLabelPlaceholder', 'Label')} />
                    )}
                    {!isCreate && q.file.type.startsWith('image/') && (
                      <button type="button" onClick={() => setResizeTarget(q.id)} title={t('upload.resizeCompressTitle', 'Resize / compress')} aria-label={t('upload.resizeCompressTitle', 'Resize / compress')} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700">
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

            {isCreate && <ScanStatus scanning={scan.scanning} />}
            {submitting && <UploadProgressList items={progressItems} className="mt-2" />}
          </div>

          {isCreate && (
            <>
              <Input
                label={t('upload.fileNameLabel', 'File name')}
                required
                maxLength={TITLE_MAX}
                value={title}
                onChange={handleTitleChange}
                placeholder={t('upload.titlePlaceholder', 'e.g. Aadhaar Card')}
              />
              <Textarea
                label={t('upload.notesOptionalLabel', 'Notes (optional)')}
                rows={2}
                maxLength={5000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </>
          )}
        </div>
      </Modal>

      {!isCreate && (
        <ResizeTool
          isOpen={Boolean(resizeTarget)}
          onClose={() => setResizeTarget(null)}
          file={queue.find((q) => q.id === resizeTarget)?.file}
          mode="standalone"
          onResult={handleResizeResult}
        />
      )}
    </>
  );
}
