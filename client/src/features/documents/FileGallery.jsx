import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import { Dropdown, DropdownItem, DropdownDivider } from '@/components/ui/Dropdown.jsx';
import { MoreIcon } from '@/components/layout/icons.jsx';
import { filesApi } from '@/services/filesApi.js';
import UploadModal from './UploadModal.jsx';
import FilePreview from './FilePreview.jsx';
import ResizeTool from '@/features/resize/ResizeTool.jsx';
import { useRemoveFile, useUpdateFileMeta, useReplaceFile, useDocumentZip } from './documentsHooks.js';
import { downloadZipFrom } from './zipDownload.js';

/**
 * Multi-file gallery for a document: add/replace/relabel/reorder/delete,
 * thumbnails lazy-loaded (native `loading="lazy"`), tap to open
 * `FilePreview` (full-screen viewer). Per-file "…" menu also opens the
 * resize/compress tool for images (the document-viewer entry point — see
 * `features/resize/ResizeTool.jsx`'s doc comment).
 */
export default function FileGallery({ document }) {
  const [previewIndex, setPreviewIndex] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resizeSource, setResizeSource] = useState(null); // File fetched from an existing file's signed url
  const [resizeLoading, setResizeLoading] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const replaceInputRef = useRef(null);
  const replaceTargetId = useRef(null);

  const removeFile = useRemoveFile(document.id);
  const updateMeta = useUpdateFileMeta(document.id);
  const replaceFile = useReplaceFile(document.id);
  const zip = useDocumentZip();

  const files = [...(document.files || [])].sort((a, b) => a.order - b.order);

  const move = async (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= files.length) return;
    const a = files[index];
    const b = files[target];
    try {
      await Promise.all([
        updateMeta.mutateAsync({ fileId: a.id, payload: { order: b.order } }),
        updateMeta.mutateAsync({ fileId: b.id, payload: { order: a.order } }),
      ]);
    } catch {
      toast.error('Could not reorder files');
    }
  };

  const startRename = (file) => {
    setRenamingId(file.id);
    setRenameValue(file.label || '');
  };
  const commitRename = async () => {
    if (!renamingId) return;
    const id = renamingId;
    setRenamingId(null);
    try {
      await updateMeta.mutateAsync({ fileId: id, payload: { label: renameValue } });
    } catch {
      toast.error('Could not rename the file');
    }
  };

  const handleReplaceClick = (fileId) => {
    replaceTargetId.current = fileId;
    replaceInputRef.current?.click();
  };
  const handleReplaceChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !replaceTargetId.current) return;
    try {
      await replaceFile.mutateAsync({ fileId: replaceTargetId.current, file });
      toast.success('File replaced');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not replace the file');
    }
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm('Delete this file? This cannot be undone.')) return;
    try {
      await removeFile.mutateAsync(fileId);
      toast.success('File deleted');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not delete the file');
    }
  };

  const handleDownloadAll = () => {
    downloadZipFrom(zip.mutateAsync({ id: document.id }), `${document.title || 'document'}.zip`);
  };

  const handleOpenResize = async (file) => {
    setResizeLoading(true);
    try {
      const res = await fetch(filesApi.resolveUrl(file.url));
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      setResizeSource(new File([blob], file.originalName || file.label || 'image.jpg', { type: file.mimeType || blob.type }));
    } catch {
      toast.error('Could not load this image for editing');
    } finally {
      setResizeLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{files.length} file{files.length === 1 ? '' : 's'}</p>
        <div className="flex gap-2">
          {files.length > 1 && <Button variant="secondary" size="sm" onClick={handleDownloadAll}>Download all (ZIP)</Button>}
          <Button size="sm" onClick={() => setAddOpen(true)}>+ Add files</Button>
        </div>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No files yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {files.map((file, index) => (
            <div key={file.id} className="group relative rounded-xl border border-neutral-200 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => setPreviewIndex(index)}
                className="block aspect-square w-full overflow-hidden rounded-t-xl bg-neutral-100 dark:bg-neutral-800"
              >
                {file.thumbUrl ? (
                  <img
                    src={filesApi.resolveUrl(file.thumbUrl)}
                    alt={file.label || file.originalName}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs font-medium text-neutral-400">
                    {file.mimeType === 'application/pdf' ? 'PDF' : 'FILE'}
                  </span>
                )}
              </button>

              <div className="flex items-center gap-1 p-2">
                {renamingId === file.id ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                    className="flex-1 text-xs"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startRename(file)}
                    className="min-w-0 flex-1 truncate text-left text-xs font-medium text-neutral-700 dark:text-neutral-200"
                    title="Rename"
                  >
                    {file.label || file.originalName}
                  </button>
                )}

                <Dropdown
                  align="right"
                  trigger={
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700">
                      <MoreIcon className="h-4 w-4" />
                    </span>
                  }
                >
                  <DropdownItem onSelect={() => setPreviewIndex(index)}>View</DropdownItem>
                  <DropdownItem onSelect={() => filesApi.triggerDownload(file.downloadUrl, file.originalName)}>Download</DropdownItem>
                  <DropdownItem onSelect={() => startRename(file)}>Rename</DropdownItem>
                  <DropdownItem onSelect={() => handleReplaceClick(file.id)}>Replace file</DropdownItem>
                  {file.mimeType?.startsWith('image/') && (
                    <DropdownItem onSelect={() => handleOpenResize(file)} disabled={resizeLoading}>Resize / compress…</DropdownItem>
                  )}
                  {index > 0 && <DropdownItem onSelect={() => move(index, -1)}>Move earlier</DropdownItem>}
                  {index < files.length - 1 && <DropdownItem onSelect={() => move(index, 1)}>Move later</DropdownItem>}
                  <DropdownDivider />
                  <DropdownItem danger onSelect={() => handleDelete(file.id)}>Delete</DropdownItem>
                </Dropdown>
              </div>
            </div>
          ))}
        </div>
      )}

      <input ref={replaceInputRef} type="file" className="sr-only" onChange={handleReplaceChange} />

      {previewIndex !== null && (
        <FilePreview files={files} startIndex={previewIndex} onClose={() => setPreviewIndex(null)} document={document} />
      )}

      <UploadModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        mode="append"
        documentId={document.id}
      />

      <ResizeTool
        isOpen={Boolean(resizeSource)}
        onClose={() => setResizeSource(null)}
        mode="attach"
        documentId={document.id}
        file={resizeSource}
      />
    </div>
  );
}
