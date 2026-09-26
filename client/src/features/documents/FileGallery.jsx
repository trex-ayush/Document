import { useState } from 'react';
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
import { prepareFiles, uploadErrorMessage, useFilePicker } from './filePicking.jsx';
import { Camera, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { useCanWrite } from '@/hooks/useCanWrite.js';

const fileName = (file) => file.label || file.originalName || '';

/**
 * The files of one document: tap a tile to view it full-screen; each file has Download · Share ·
 * Delete. "+ Add files" / "Take photo" upload straight away (with a progress bar). The last file
 * can't be deleted — a document always keeps at least one (delete the document instead).
 */
export default function FileGallery({ document }) {
  const { t } = useTranslation(['documents', 'common']);
  const canWrite = useCanWrite();
  const [previewIndex, setPreviewIndex] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [upload, setUpload] = useState(null); // { count, progress }

  const addFiles = useAddFiles(document.id);
  const removeFile = useRemoveFile(document.id);
  const zip = useDocumentZip();

  const files = [...(document.files || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleFiles = async (picked) => {
    if (upload) return;
    const ready = await prepareFiles(picked);
    setUpload({ count: ready.length, progress: 0 });
    try {
      await addFiles.mutateAsync({
        payload: { files: ready },
        onUploadProgress: (evt) => {
          if (evt.total) setUpload((u) => (u ? { ...u, progress: Math.round((evt.loaded / evt.total) * 100) } : u));
        },
      });
      toast.success(t('upload.toasts.filesAdded', 'Files added'));
    } catch (err) {
      toast.error(uploadErrorMessage(err, t));
    } finally {
      setUpload(null);
    }
  };
  const picker = useFilePicker({ onFiles: handleFiles });

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

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={SECTION_TITLE}>
          {t('fileGallery.heading', 'Files ({{count}})', { count: files.length })}
        </h2>
        {files.length > 1 && (
          <Button variant="ghost" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={handleDownloadAll}>
            {t('fileGallery.downloadAll', 'Download all')}
          </Button>
        )}
      </div>
      {canWrite && (
      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={picker.openFiles} disabled={Boolean(upload)}>
          {t('fileGallery.addFiles', 'Add files')}
        </Button>
        <Button variant="secondary" size="sm" leftIcon={<Camera className="h-4 w-4" />} onClick={picker.openCamera} disabled={Boolean(upload)}>
          {t('add.takePhoto', 'Take photo')}
        </Button>
      </div>
      )}
      {picker.inputs}

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

      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 ${GRID_GAP}`}>
        {files.map((file, index) => (
          <div key={file.id} className={`overflow-hidden ${CARD_SURFACE}`}>
            <button
              type="button"
              onClick={() => setPreviewIndex(index)}
              className="block aspect-[4/3] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900"
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
            <p className="truncate px-3 pt-2 text-xs font-medium text-neutral-700 dark:text-neutral-300" title={fileName(file)}>
              {fileName(file)}
            </p>
            <div className="flex items-center gap-1 px-1 pb-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => filesApi.triggerDownload(file.downloadUrl, file.originalName)}
                aria-label={t('common:actions.download', 'Download')}
                title={t('common:actions.download', 'Download')}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </Button>
              <ShareButton targetType="document" targetId={document.id} fileIds={[file.id]} variant="icon" label={t('fileGallery.shareFile', 'Share this file')} />
              {canWrite && files.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  onClick={() => setDeleteTarget(file)}
                  aria-label={t('common:actions.delete', 'Delete')}
                  title={t('common:actions.delete', 'Delete')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {previewIndex !== null && (
        <FilePreview files={files} startIndex={previewIndex} onClose={() => setPreviewIndex(null)} />
      )}

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
