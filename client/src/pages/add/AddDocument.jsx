import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Textarea from '@/components/ui/Textarea.jsx';
import { Card, CardBody } from '@/components/ui/Card.jsx';
import PageContainer from '@/components/ui/PageContainer.jsx';
import { FIELD_ERROR, FIELD_LABEL } from '@/components/ui/tokens.js';
import { FileDropzone, UploadProgressList } from '@/components/ui/FileDropzone.jsx';
import { useCreateDocument } from '@/features/documents/documentsHooks.js';
import { FILE_ACCEPT, uploadErrorMessage, useFilePicker } from '@/features/documents/filePicking.jsx';
import { useCropQueue } from '@/features/documents/crop/useCropQueue.jsx';
import QueuedFiles from '@/features/documents/crop/QueuedFiles.jsx';
import QueuedPreview from '@/features/documents/crop/QueuedPreview.jsx';
import { useDocumentScan } from '@/features/scan/useDocumentScan.js';
import ScanStatus from '@/features/scan/ScanStatus.jsx';
import FolderField from '@/features/folders/FolderField.jsx';
import AddPageHeader from './AddPageHeader.jsx';
import { useGoBack } from './useGoBack.js';
import { Camera, Upload } from 'lucide-react';
import RequireWrite from '@/features/members/RequireWrite.jsx';
import Tooltip from '@/components/ui/Tooltip.jsx';

const TITLE_MAX = 200;
const NOTES_MAX = 10000;

const baseName = (name) => String(name || '').replace(/\.[^./\\]+$/, '').trim();

/**
 * `/add/document?folderId=&capture=1` — Title (required), Files (at least one), Notes.
 *
 * Who writes the title: the user typing wins over the scanner, which wins over the first file's
 * name. The silent scanner (features/scan) may also write the known details it read (name, number…)
 * into Notes — only while the user hasn't typed any notes — and the full text it read from each
 * file is saved with that file. Saving is never blocked by it; a scan still running is cancelled.
 * No `folderId` = the server saves it in the family's Shared folder.
 */
export default function AddDocument() {
  return (
    <RequireWrite>
      <AddDocumentPage />
    </RequireWrite>
  );
}

function AddDocumentPage() {
  const { t } = useTranslation(['documents', 'common']);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlFolderId = params.get('folderId') || null;
  const [folderId, setFolderId] = useState(urlFolderId);
  const autoCapture = params.get('capture') === '1';
  const goBack = useGoBack(urlFolderId ? `/browse/${urlFolderId}` : '/');

  // Picked files; photos are auto-cropped like a scanner app (see useCropQueue).
  const files = useCropQueue();
  const { queue } = files;
  // Wide screens show one picked file large next to the list (the first, until another is picked).
  const [previewId, setPreviewId] = useState(null);
  const previewEntry = queue.find((q) => q.id === previewId) || queue[0] || null;
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  // The text the scanner read from each queued file, by queue id — saved with that file.
  const [texts, setTexts] = useState({});
  const [errors, setErrors] = useState({});
  const [progress, setProgress] = useState(null); // null = not uploading, else 0-100

  const titleSource = useRef('none'); // 'none' | 'file' | 'scan' | 'user'
  const notesSource = useRef('none'); // 'none' | 'scan' | 'user'
  const createDoc = useCreateDocument();
  const submitting = progress !== null;

  const addToQueue = (picked) => {
    setErrors((e) => ({ ...e, files: null }));
    return files.add(picked);
  };
  const picker = useFilePicker({ onFiles: addToQueue });

  // "Take photo" from the + Add menu opens the camera straight away (once).
  const autoCaptured = useRef(false);
  useEffect(() => {
    if (!autoCapture || autoCaptured.current) return undefined;
    // Marked inside the timer: a cancelled first run (React's dev double-mount) must not block it.
    const timer = setTimeout(() => {
      autoCaptured.current = true;
      picker.openCamera();
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCapture]);

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
    // Photos are read once their auto-crop is done (the crop reads better).
    queue: queue.filter((q) => !q.detecting),
    onFill: (plan) => {
      if (plan.texts) setTexts((prev) => ({ ...prev, ...plan.texts }));
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
        payload: { data, files: queue.map((q) => q.file), texts: queue.map((q) => texts[q.id] || '') },
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
      <AddPageHeader title={t('add.documentTitle', 'Upload document')} onBack={goBack} />

      <form onSubmit={handleSubmit} noValidate>
        <Card>
          {/* Phones: one column. From xl: files with a large preview on the left; folder, title,
              notes and Save on the right. */}
          <CardBody className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:grid-rows-[repeat(5,auto)_1fr] xl:gap-x-8">
            <div className="xl:col-start-2 xl:row-start-1">
              <FolderField folderId={folderId} onChange={setFolderId} />
            </div>
            <div className="min-w-0 xl:col-start-1 xl:row-span-6 xl:row-start-1">
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
                <Tooltip content={t('tip.chooseFiles', 'Pick a photo or PDF')}>
                  <Button type="button" variant="secondary" leftIcon={<Upload className="h-4 w-4" />} onClick={picker.openFiles} disabled={submitting}>
                    {t('add.chooseFiles', 'Choose files')}
                  </Button>
                </Tooltip>
                <Tooltip content={t('tip.takePhoto', 'Take a photo with the camera')}>
                  <Button type="button" variant="secondary" leftIcon={<Camera className="h-4 w-4" />} onClick={picker.openCamera} disabled={submitting}>
                    {t('add.takePhoto', 'Take photo')}
                  </Button>
                </Tooltip>
              </div>
              {picker.inputs}
              {errors.files && !queue.length && <p className={FIELD_ERROR}>{errors.files}</p>}

              <QueuedFiles
                className="mt-3"
                queue={queue}
                onEditCrop={files.editCrop}
                onRemove={files.remove}
                disabled={submitting}
                selectedId={previewEntry?.id}
                onSelect={setPreviewId}
              />
              <ScanStatus scanning={scan.scanning} />
              {previewEntry && (
                <div className="mt-3 hidden xl:block">
                  <QueuedPreview entry={previewEntry} onEditCrop={files.editCrop} disabled={submitting} />
                </div>
              )}
            </div>

            <div className="xl:col-start-2 xl:row-start-2">
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
            </div>

            <div className="xl:col-start-2 xl:row-start-3">
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
            </div>

            {submitting && (
              <UploadProgressList
                className="xl:col-start-2 xl:row-start-4"
                items={[{
                  id: 'upload',
                  name: t('upload.uploadingCount', 'Uploading {{count}} files…', { count: queue.length }),
                  progress,
                  status: progress >= 100 ? 'done' : 'uploading',
                }]}
              />
            )}

            <div className="kb-sticky flex justify-end gap-2 pt-1 xl:col-start-2 xl:row-start-5 xl:self-start">
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
      {files.cropEditor}
    </PageContainer>
  );
}
