import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * FileDropzone — drag-and-drop + click-to-browse file picker, plus
 * `UploadProgressList`/`UploadProgressItem` for per-file progress bars below
 * it while an upload is in flight.
 *
 * Ported from apps/component/src/components/ui/FileDropzone.tsx, reimplemented
 * on native HTML5 drag/drop + `<input type="file">` instead of
 * `react-dropzone` — that package isn't in docs/DECISIONS.md's client
 * dependency list. `accept` is a comma-separated string of extensions
 * (`.pdf,.jpg`) and/or MIME types/wildcards (`image/*`), matching the
 * `accept` attribute's own syntax, instead of react-dropzone's `{mime: []}`
 * object shape.
 *
 * FileDropzone props:
 *  - onFilesSelected(accepted: File[], rejected: {file, reasons: string[]}[])  — required
 *  - accept?     string, e.g. ".pdf,.jpg,.png,image/*"
 *  - maxSize?    bytes
 *  - maxFiles?   caps the accepted array (extra files are silently dropped, not rejected)
 *  - multiple?   default true
 *  - disabled?
 *  - hint?       string shown below the main copy
 *  - children?   rendered above the "Click to upload / drag and drop" copy
 *  - className?
 *
 * Upload progress (Agent E wires these to `documentsApi.create`'s
 * `onUploadProgress` axios callback and its own per-file upload queue state):
 *  - `<UploadProgressList items={[{ id, name, progress, status, error? }]} onCancel? onRetry? />`
 *  - `status`: 'uploading' | 'done' | 'error'
 *
 * @example
 * <FileDropzone onFilesSelected={(files) => setQueue(files)} accept="application/pdf,image/*" maxSize={25 * 1024 * 1024} hint="PDF or image, up to 25MB" />
 * <UploadProgressList items={uploadQueue} onCancel={cancelUpload} />
 */
function matchesAccept(file, accept) {
  if (!accept) return true;
  const patterns = accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return true;
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return patterns.some((p) => {
    if (p.startsWith('.')) return name.endsWith(p);
    if (p.endsWith('/*')) return type.startsWith(p.slice(0, -1));
    return type === p;
  });
}

export function FileDropzone({
  onFilesSelected,
  accept,
  maxSize,
  maxFiles,
  disabled = false,
  multiple = true,
  hint,
  children,
  className = '',
}) {
  const { t } = useTranslation('common');
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragReject, setDragReject] = useState(false);

  const processFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList || []);
      const accepted = [];
      const rejected = [];
      files.forEach((file) => {
        const reasons = [];
        if (!matchesAccept(file, accept)) reasons.push('file-invalid-type');
        if (maxSize && file.size > maxSize) reasons.push('file-too-large');
        if (reasons.length) rejected.push({ file, reasons });
        else accepted.push(file);
      });
      const limited = maxFiles ? accepted.slice(0, maxFiles) : accepted;
      onFilesSelected?.(limited, rejected);
    },
    [accept, maxSize, maxFiles, onFilesSelected],
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    setDragReject(false);
    if (disabled) return;
    processFiles(e.dataTransfer.files);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    if (disabled) return;
    setDragActive(true);
    const items = Array.from(e.dataTransfer.items || []);
    const anyInvalid = accept && items.some((it) => it.type && !matchesAccept({ name: '', type: it.type }, accept));
    setDragReject(!!anyInvalid);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
    setDragReject(false);
  };

  const onInputChange = (e) => {
    processFiles(e.target.files);
    e.target.value = '';
  };

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker();
        }
      }}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={[
        'flex flex-col items-center justify-center gap-2 px-6 py-10 rounded-2xl border-2 border-dashed text-center transition-colors',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        dragReject
          ? 'border-red-400 bg-red-50/40 dark:bg-red-900/10'
          : dragActive
            ? 'border-primary-400 bg-primary-50/60 dark:bg-primary-900/10'
            : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50/40 dark:bg-neutral-800/30 hover:border-neutral-300 dark:hover:border-neutral-600',
        className,
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={onInputChange}
        className="sr-only"
      />
      <svg className="h-8 w-8 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 7.5m0 0L7.5 12M12 7.5v9" />
      </svg>
      {children}
      <p className="text-sm text-neutral-700 dark:text-neutral-200">
        {dragActive ? (
          dragReject ? (
            <span className="font-medium text-red-600">{t('fileDropzone.fileTypeNotAccepted', 'File type not accepted')}</span>
          ) : (
            <span className="font-medium">{t('fileDropzone.dropToUpload', 'Drop the files to upload')}</span>
          )
        ) : (
          <>
            <span className="font-medium">{t('fileDropzone.clickToUpload', 'Click to upload')}</span> {t('fileDropzone.orDragAndDrop', 'or drag and drop')}
          </>
        )}
      </p>
      {hint && <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
    </div>
  );
}

export function UploadProgressItem({ item, onCancel, onRetry }) {
  const { t } = useTranslation('common');
  const pct = Math.min(100, Math.max(0, item.progress ?? 0));
  const isError = item.status === 'error';
  const isDone = item.status === 'done';
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-neutral-900 dark:text-neutral-100 truncate">{item.name}</p>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
            {isError ? t('fileDropzone.failed', 'Failed') : isDone ? t('fileDropzone.done', 'Done') : `${pct}%`}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-200 ${isError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-primary-500'}`}
            style={{ width: `${isError ? 100 : pct}%` }}
          />
        </div>
        {isError && item.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{item.error}</p>}
      </div>
      {isError && onRetry && (
        <button type="button" onClick={() => onRetry(item)} className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400">
          {t('actions.retry', 'Retry')}
        </button>
      )}
      {!isError && !isDone && onCancel && (
        <button
          type="button"
          onClick={() => onCancel(item)}
          aria-label={t('fileDropzone.cancelUploadOf', 'Cancel upload of {{name}}', { name: item.name })}
          className="flex-shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function UploadProgressList({ items, onCancel, onRetry, className = '' }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`divide-y divide-neutral-100 dark:divide-neutral-700 ${className}`}>
      {items.map((item) => (
        <UploadProgressItem key={item.id} item={item} onCancel={onCancel} onRetry={onRetry} />
      ))}
    </div>
  );
}

export default FileDropzone;
