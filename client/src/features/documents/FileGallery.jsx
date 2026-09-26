import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import { UploadProgressList } from '@/components/ui/FileDropzone.jsx';
import ShareButton from '@/features/share/ShareButton.jsx';
import { CARD_SURFACE, GRID_GAP, ITEM_ICON_LG, KIND_ICON, SECTION_TITLE } from '@/components/ui/tokens.js';
import { filesApi } from '@/services/filesApi.js';
import FilePreview from './FilePreview.jsx';
import { useAddFiles, useRemoveFile, useDocumentZip } from './documentsHooks.js';
import { downloadZipFrom } from './zipDownload.js';
import { uploadErrorMessage, useFilePicker } from './filePicking.jsx';
import { useCropQueue } from './crop/useCropQueue.jsx';
import AddFilesDrawer from './AddFilesDrawer.jsx';
import { FileTextEditor, FileTextPanel } from './FileTextBlock.jsx';
import { useDocumentScan } from '@/features/scan/useDocumentScan.js';
import { Camera, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { useCanWrite } from '@/hooks/useCanWrite.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

const fileName = (file) => file.label || file.originalName || '';

/**
 * The files of one document: tap a tile to view it full-screen; each file has Download · Share ·
 * Delete. "+ Add files" / "Take photo" open a short step (AddFilesDrawer) where photos are
 * auto-cropped and each crop can be adjusted, then Upload (with a progress bar). The last file
 * can't be deleted — a document always keeps at least one (delete the document instead).
 */
export default function FileGallery({ document }) {
  const { t } = useTranslation(['documents', 'common']);
  const canWrite = useCanWrite();
  const [previewIndex, setPreviewIndex] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [upload, setUpload] = useState(null); // { count, progress }
  const [adding, setAdding] = useState(false); // the Add files step is open
  const pending = useCropQueue();
  const [pendingTexts, setPendingTexts] = useState({}); // text read from each picked file, by queue id
  const [waitingForScan, setWaitingForScan] = useState(false); // Upload pressed while still reading
  const [editingText, setEditingText] = useState(null); // the file whose text is being corrected

  const addFiles = useAddFiles(document.id);
  const removeFile = useRemoveFile(document.id);
  const zip = useDocumentZip();

  const files = [...(document.files || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Picked files wait in the Add files step (auto-crop, Edit crop) until Upload.
  const handleFiles = (picked) => {
    if (upload) return;
    setAdding(true);
    pending.add(picked);
  };

  // Photos and PDFs picked here are read like on "Add document"; each file's text is saved with it.
  const scan = useDocumentScan({
    enabled: adding,
    queue: pending.queue.filter((q) => !q.detecting),
    onFill: (plan) => {
      if (plan.texts) setPendingTexts((prev) => ({ ...prev, ...plan.texts }));
    },
  });

  const cancelAdding = () => {
    setAdding(false);
    setWaitingForScan(false);
    setPendingTexts({});
    pending.clear();
  };

  const handleUpload = async () => {
    const ready = pending.queue.map((q) => q.file);
    if (!ready.length || upload) return;
    // Still reading: upload as soon as the text is ready, so it's saved with the files.
    if (scan.scanning) {
      setWaitingForScan(true);
      return;
    }
    setWaitingForScan(false);
    const texts = pending.queue.map((q) => pendingTexts[q.id] || '');
    setAdding(false);
    setUpload({ count: ready.length, progress: 0 });
    try {
      await addFiles.mutateAsync({
        payload: { files: ready, texts },
        onUploadProgress: (evt) => {
          if (evt.total) setUpload((u) => (u ? { ...u, progress: Math.round((evt.loaded / evt.total) * 100) } : u));
        },
      });
      pending.clear();
      setPendingTexts({});
      toast.success(t('upload.toasts.filesAdded', 'Files added'));
    } catch (err) {
      // Back to the list, so nothing picked or cropped is lost.
      setAdding(true);
      toast.error(uploadErrorMessage(err, t));
    } finally {
      setUpload(null);
    }
  };
  const picker = useFilePicker({ onFiles: handleFiles });

  const uploadRef = useRef(handleUpload);
  uploadRef.current = handleUpload;
  useEffect(() => {
    if (waitingForScan && !scan.scanning) uploadRef.current();
  }, [waitingForScan, scan.scanning]);

  const handleDelete = async () => {
    try {
      await removeFile.mutateAsync(deleteTarget.id);
      toast.success(t('fileGallery.toasts.deleted', 'Moved to the Bin'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('fileGallery.toasts.deleteFailed', 'Could not delete the file'));
    }
  };

  const handleDownloadAll = () => {
    downloadZipFrom(zip.mutateAsync({ id: document.id }), `${document.title || 'document'}.zip`);
  };

  // One file: its preview (tap to open the viewer), name, and Download · Share · Delete.
  const fileTile = (file, index, wide = false) => (
    <>
      <button
        type="button"
        onClick={() => setPreviewIndex(index)}
        className={`block w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900 ${wide ? 'aspect-[16/9] lg:aspect-[4/3]' : 'aspect-[4/3]'}`}
        aria-label={t('fileGallery.viewFile', 'View {{name}}', { name: fileName(file) })}
      >
        {file.thumbUrl ? (
          <img src={filesApi.resolveUrl(file.thumbUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-1">
            <FileText
              className={`${ITEM_ICON_LG} ${file.mimeType === 'application/pdf' ? KIND_ICON.pdf : KIND_ICON.document}`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              {file.mimeType === 'application/pdf' ? 'PDF' : t('fileGallery.file', 'File')}
            </span>
          </span>
        )}
      </button>
      <Tooltip content={fileName(file)} onlyWhenOverflow className="flex min-w-0 px-3 pt-2">
        <p className="min-w-0 truncate text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {fileName(file)}
        </p>
      </Tooltip>
      <div className="flex items-center gap-1 px-1 pb-1">
        <Tooltip content={t('common:tip.download', 'Download')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => filesApi.triggerDownload(file.downloadUrl, file.originalName)}
            aria-label={t('common:actions.download', 'Download')}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Tooltip>
        <ShareButton targetType="document" targetId={document.id} fileIds={[file.id]} variant="icon" label={t('fileGallery.shareFile', 'Share this file')} />
        {canWrite && files.length > 1 && (
          <Tooltip content={t('tip.deleteFile', 'Delete this file')} className="ml-auto inline-flex">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteTarget(file)}
              aria-label={t('common:actions.delete', 'Delete')}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Tooltip>
        )}
      </div>
    </>
  );
  // Once any file has read text, each file is a wide row: the file on the left and its text on
  // the right (lg+), or the text under the file (phones). Otherwise the usual grid of tiles.
  const withText = files.some((f) => f.text);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={SECTION_TITLE}>
          {t('fileGallery.heading', 'Files ({{count}})', { count: files.length })}
        </h2>
        {files.length > 1 && (
          <Tooltip content={t('tip.downloadAll', 'Download all files')}>
            <Button variant="ghost" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={handleDownloadAll}>
              {t('fileGallery.downloadAll', 'Download all')}
            </Button>
          </Tooltip>
        )}
      </div>
      {canWrite && (
      <div className="mb-3 flex flex-wrap gap-2">
        <Tooltip content={t('tip.addFiles', 'Add more files')}>
          <Button variant="secondary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={picker.openFiles} disabled={Boolean(upload)}>
            {t('fileGallery.addFiles', 'Add files')}
          </Button>
        </Tooltip>
        <Tooltip content={t('tip.takePhoto', 'Take a photo')}>
          <Button variant="secondary" size="sm" leftIcon={<Camera className="h-4 w-4" />} onClick={picker.openCamera} disabled={Boolean(upload)}>
            {t('add.takePhoto', 'Take photo')}
          </Button>
        </Tooltip>
      </div>
      )}
      {picker.inputs}
      <AddFilesDrawer
        isOpen={adding}
        files={pending}
        picker={picker}
        busy={pending.editing || picker.cameraOpen}
        reading={scan.scanning}
        waiting={waitingForScan}
        onUpload={handleUpload}
        onCancel={cancelAdding}
      />
      {pending.cropEditor}

      {upload && (
        <UploadProgressList
          className="mb-3"
          items={[{
            id: 'upload',
            name: t('upload.uploadingCount', 'Uploading {{count}} files…', { count: upload.count }),
            progress: upload.progress,
            status: 'uploading',
          }]}
        />
      )}

      {withText ? (
        <div className="space-y-3">
          {files.map((file, index) => (
            <div key={file.id} className={`overflow-hidden lg:flex lg:items-start ${CARD_SURFACE}`}>
              <div className="lg:w-60 lg:flex-shrink-0 lg:self-stretch lg:border-r lg:border-neutral-100 dark:lg:border-neutral-700">{fileTile(file, index, true)}</div>
              <FileTextPanel
                text={file.text}
                onEdit={canWrite ? () => setEditingText(file) : undefined}
                className="flex-1 border-t border-neutral-100 lg:border-t-0 dark:border-neutral-700"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 ${GRID_GAP}`}>
          {files.map((file, index) => (
            <div key={file.id} className={`overflow-hidden ${CARD_SURFACE}`}>
              {fileTile(file, index)}
            </div>
          ))}
        </div>
      )}

      {previewIndex !== null && (
        <FilePreview
          files={files}
          startIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onEditText={
            canWrite
              ? (file) => {
                setPreviewIndex(null);
                setEditingText(file);
              }
              : undefined
          }
        />
      )}

      <FileTextEditor documentId={document.id} file={editingText} onClose={() => setEditingText(null)} />

      <ConfirmDrawer
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('fileGallery.deleteFileTitle', 'Move this file to the Bin?')}
        description={t('fileGallery.deleteFileDescription', '“{{name}}” moves to the Bin. You can restore it from the Bin.', { name: deleteTarget ? fileName(deleteTarget) : '' })}
        confirmLabel={t('detail.moveToBin', 'Move to Bin')}
      />
    </section>
  );
}
