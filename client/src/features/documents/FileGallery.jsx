import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import { UploadProgressList } from '@/components/ui/FileDropzone.jsx';
import ShareButton from '@/features/share/ShareButton.jsx';
import { filesApi } from '@/services/filesApi.js';
import FilePreview from './FilePreview.jsx';
import { useAddFiles, useRemoveFile, useDocumentZip } from './documentsHooks.js';
import { downloadZipFrom } from './zipDownload.js';
import { prepareFiles, uploadErrorMessage, useFilePicker } from './filePicking.jsx';
import { Camera, Download, FileText, Plus, Trash2 } from 'lucide-react';

export const fileName = (file) => file.label || file.originalName || '';

const iconBtn =
  'flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100';

/**
 * The files of one document: tap a tile to view it full-screen; each file has Download · Share ·
 * Delete. "+ Add files" / "Take photo" upload straight away (with a progress bar). The last file
 * can't be deleted — a document always keeps at least one (delete the document instead).
 */
export default function FileGallery({ document }) {
  const { t } = useTranslation(['documents', 'common']);
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
      toast.success(t('fileGallery.toasts.deleted', 'File deleted'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('fileGallery.toasts.deleteFailed', 'Could not delete the file'));
    }
  };

  const handleDownloadAll = () => {
    downloadZipFrom(zip.mutateAsync({ id: document.id }), `${document.title || 'document'}.zip`);
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {t('fileGallery.heading', 'Files ({{count}})', { count: files.length })}
        </h2>
        {files.length > 1 && (
          <Button variant="ghost" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={handleDownloadAll}>
            {t('fileGallery.downloadAll', 'Download all')}
          </Button>
        )}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={picker.openFiles} disabled={Boolean(upload)}>
          {t('fileGallery.addFiles', 'Add files')}
        </Button>
        <Button variant="secondary" size="sm" leftIcon={<Camera className="h-4 w-4" />} onClick={picker.openCamera} disabled={Boolean(upload)}>
          {t('add.takePhoto', 'Take photo')}
        </Button>
      </div>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {files.map((file, index) => (
          <div key={file.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setPreviewIndex(index)}
              className="block aspect-[4/3] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900"
              aria-label={t('fileGallery.viewFile', 'View {{name}}', { name: fileName(file) })}
            >
              {file.thumbUrl ? (
                <img src={filesApi.resolveUrl(file.thumbUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-1 text-neutral-400">
                  <FileText className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
                  <span className="text-xs font-medium">{file.mimeType === 'application/pdf' ? 'PDF' : t('fileGallery.file', 'File')}</span>
                </span>
              )}
            </button>
            <p className="truncate px-2.5 pt-2 text-xs font-medium text-neutral-700 dark:text-neutral-200" title={fileName(file)}>
              {fileName(file)}
            </p>
            <div className="flex items-center gap-0.5 px-1.5 pb-1.5 pt-0.5">
              <button
                type="button"
                className={iconBtn}
                onClick={() => filesApi.triggerDownload(file.downloadUrl, file.originalName)}
                aria-label={t('common:actions.download', 'Download')}
                title={t('common:actions.download', 'Download')}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
              <ShareButton targetType="document" targetId={document.id} fileIds={[file.id]} variant="icon" label={t('fileGallery.shareFile', 'Share this file')} />
              {files.length > 1 && (
                <button
                  type="button"
                  className={`${iconBtn} ml-auto hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-900/20`}
                  onClick={() => setDeleteTarget(file)}
                  aria-label={t('common:actions.delete', 'Delete')}
                  title={t('common:actions.delete', 'Delete')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
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
        title={t('fileGallery.deleteFileTitle', 'Delete this file?')}
        description={t('fileGallery.deleteFileDescription', '“{{name}}” will be removed from this document for good.', { name: deleteTarget ? fileName(deleteTarget) : '' })}
        confirmLabel={t('common:actions.delete', 'Delete')}
      />
    </section>
  );
}
