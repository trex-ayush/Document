import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Textarea from '@/components/ui/Textarea.jsx';
import { Card, CardBody } from '@/components/ui/Card.jsx';
import PageContainer from '@/components/ui/PageContainer.jsx';
import { ListIcon } from '@/components/ui/ListRow.jsx';
import { FIELD_ERROR, FIELD_GAP, FIELD_LABEL } from '@/components/ui/tokens.js';
import { FileDropzone, UploadProgressList } from '@/components/ui/FileDropzone.jsx';
import { useCreateDocument } from '@/features/documents/documentsHooks.js';
import { FILE_ACCEPT, prepareFiles, uploadErrorMessage, useFilePicker } from '@/features/documents/filePicking.jsx';
import { useDocumentScan } from '@/features/scan/useDocumentScan.js';
import ScanStatus from '@/features/scan/ScanStatus.jsx';
import AddPageHeader from './AddPageHeader.jsx';
import { useGoBack } from './useGoBack.js';
import { Camera, FileText, Upload, X } from 'lucide-react';

const TITLE_MAX = 200;
const NOTES_MAX = 10000;

let queueSeq = 0;
const baseName = (name) => String(name || '').replace(/\.[^./\\]+$/, '').trim();

/**
 * `/add/document?folderId=&capture=1` — Title (required), Files (at least one), Notes.
 *
 * Who writes the title: the user typing wins over the scanner, which wins over the first file's
 * name. The silent scanner (features/scan) may also write what it read into Notes — only while the
 * user hasn't typed any notes. Saving is never blocked by it; a scan still running is cancelled.
 * No `folderId` = the server saves it in the family's Shared folder.
 */
export default function AddDocument() {
  const { t } = useTranslation(['documents', 'common']);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlFolderId = params.get('folderId') || null;
  const [folderId, setFolderId] = useState(urlFolderId);
  const autoCapture = params.get('capture') === '1';
  const goBack = useGoBack(urlFolderId ? `/browse/${urlFolderId}` : '/');

  const [queue, setQueue] = useState([]); // [{ id, file, previewUrl }]
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [progress, setProgress] = useState(null); // null = not uploading, else 0-100

  const titleSource = useRef('none'); // 'none' | 'file' | 'scan' | 'user'
  const notesSource = useRef('none'); // 'none' | 'scan' | 'user'
  const createDoc = useCreateDocument();
  const submitting = progress !== null;

  // Free the photo previews when leaving the page.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(() => () => queueRef.current.forEach((q) => q.previewUrl && URL.revokeObjectURL(q.previewUrl)), []);

  const addToQueue = async (files) => {
    const ready = await prepareFiles(files);
    setErrors((e) => ({ ...e, files: null }));
    setQueue((prev) => [
      ...prev,
      ...ready.map((file) => ({
        id: `q${queueSeq++}`,
        file,
        previewUrl: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null,
      })),
    ]);
  };
  const picker = useFilePicker({ onFiles: addToQueue });

  // "Take photo" from the + Add menu opens the camera straight away (once).
  const autoCaptured = useRef(false);
  useEffect(() => {
    if (!autoCapture || autoCaptured.current) return undefined;
    autoCaptured.current = true;
    const timer = setTimeout(() => picker.openCamera(), 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCapture]);

  const removeQueued = (id) =>
    setQueue((prev) => {
      const gone = prev.find((q) => q.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((q) => q.id !== id);
    });

  // Title follows the first file's name until the user or the scanner sets one; with no files
  // left, whatever the file name or the scanner wrote is cleared again.
  const firstFile = queue[0]?.file;
  useEffect(() => {
    if (titleSource.current === 'user') return;
    if (!firstFile) {
      if (titleSource.current !== 'none') setTitle('');
      titleSource.current = 'none';
      if (notesSource.current === 'scan') {
        setNotes('');
        notesSource.current = 'none';
      }
      return;
    }
    if (titleSource.current === 'scan') return;
    titleSource.current = 'file';
    setTitle(baseName(firstFile.name).slice(0, TITLE_MAX));
  }, [firstFile]);

  const scan = useDocumentScan({
    enabled: true,
    queue,
    onFill: (plan) => {
      if (plan.title && titleSource.current !== 'user') {
        titleSource.current = 'scan';
        setTitle(plan.title.slice(0, TITLE_MAX));
      }
      if (plan.notes && notesSource.current !== 'user') {
        notesSource.current = 'scan';
        setNotes(plan.notes.slice(0, NOTES_MAX));
      }
    },
  });

  const handleDropzone = (accepted, rejected) => {
    rejected.forEach(({ file }) => toast.error(`${file.name}: ${t('upload.unsupportedFileType', 'unsupported file type')}`));
    if (accepted.length) addToQueue(accepted);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const next = {
      title: title.trim() ? null : t('add.titleRequired', 'Please give it a title'),
      files: queue.length ? null : t('add.filesRequired', 'Add at least one file or photo'),
    };
    setErrors(next);
    if (next.title || next.files) return;

    scan.cancel(); // save what's on screen now; a late scan result must not change it
    setProgress(0);
    try {
      const data = { title: title.trim(), notes: notes.trim() };
      if (folderId) data.folderId = folderId;
      const created = await createDoc.mutateAsync({
        payload: { data, files: queue.map((q) => q.file) },
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      });
      toast.success(t('add.toasts.documentSaved', 'Document saved'));
      navigate(`/documents/${created.id}`, { replace: true });
    } catch (err) {
      toast.error(uploadErrorMessage(err, t));
      setProgress(null);
    }
  };

  return (
    <PageContainer>
      <AddPageHeader title={t('add.documentTitle', 'Upload document')} folderId={folderId} onFolderChange={setFolderId} onBack={goBack} />

      <form onSubmit={handleSubmit} noValidate>
        <Card>
          <CardBody className={FIELD_GAP}>
            <div>
              <p className={FIELD_LABEL}>
                {t('add.filesLabel', 'Files')} <span className="text-red-500">*</span>
              </p>
              {/* Drag and drop is for computers; phones use the two buttons below. */}
              <div className="hidden sm:block">
                <FileDropzone
                  compact
                  onFilesSelected={handleDropzone}
                  accept={FILE_ACCEPT}
                  disabled={submitting}
                  hint={t('upload.dropzoneHintPlain', 'PDF or photo')}
                />
              </div>
              <div className="mt-0 flex flex-wrap gap-2 sm:mt-3">
                <Button type="button" variant="secondary" leftIcon={<Upload className="h-4 w-4" />} onClick={picker.openFiles} disabled={submitting}>
                  {t('add.chooseFiles', 'Choose files')}
                </Button>
                <Button type="button" variant="secondary" leftIcon={<Camera className="h-4 w-4" />} onClick={picker.openCamera} disabled={submitting}>
                  {t('add.takePhoto', 'Take photo')}
                </Button>
              </div>
              {picker.inputs}
              {errors.files && !queue.length && <p className={FIELD_ERROR}>{errors.files}</p>}

              {queue.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {queue.map((q) => (
                    <li key={q.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 py-1 pl-2 pr-1 dark:border-neutral-700">
                      {q.previewUrl ? <ListIcon src={q.previewUrl} /> : <ListIcon icon={FileText} kind="document" />}
                      <span className="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-300">{q.file.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeQueued(q.id)}
                        disabled={submitting}
                        aria-label={t('add.removeFile', 'Remove {{name}}', { name: q.file.name })}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <ScanStatus scanning={scan.scanning} />
            </div>

            <Input
              label={<>{t('add.titleLabel', 'Title')} <span className="text-red-500">*</span></>}
              required
              maxLength={TITLE_MAX}
              value={title}
              error={title.trim() ? null : errors.title}
              disabled={submitting}
              placeholder={t('upload.titlePlaceholder', 'e.g. Aadhaar Card')}
              onChange={(e) => {
                titleSource.current = e.target.value.trim() ? 'user' : 'none';
                setErrors((x) => ({ ...x, title: null }));
                setTitle(e.target.value);
              }}
            />

            <Textarea
              label={t('add.notesLabel', 'Notes')}
              rows={5}
              maxLength={NOTES_MAX}
              value={notes}
              disabled={submitting}
              placeholder={t('add.documentNotesPlaceholder', 'Anything useful to remember about it')}
              onChange={(e) => {
                notesSource.current = e.target.value.trim() ? 'user' : 'none';
                setNotes(e.target.value);
              }}
            />

            {submitting && (
              <UploadProgressList
                items={[{
                  id: 'upload',
                  name: t('upload.uploadingCount', 'Uploading {{count}} files…', { count: queue.length }),
                  progress,
                  status: progress >= 100 ? 'done' : 'uploading',
                }]}
              />
            )}

            <div className="kb-sticky flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={goBack} disabled={submitting}>
                {t('common:actions.cancel', 'Cancel')}
              </Button>
              <Button type="submit" loading={submitting}>
                {t('common:actions.save', 'Save')}
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
    </PageContainer>
  );
}
