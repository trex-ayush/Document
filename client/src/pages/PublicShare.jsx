import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast, { Toaster } from 'react-hot-toast';
import { Ban, Clock, Download, File, FileText, Folder, Image, SearchX } from 'lucide-react';
import { publicApi } from '@/services/publicApi.js';
import { withWakeRetry } from '@/services/serverWake.js';
import { filesApi } from '@/services/filesApi.js';
import { formatDateTime } from '@/i18n/formatters.js';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.jsx';
import Button from '@/components/ui/Button.jsx';
import { Skeleton } from '@/components/ui/Skeleton.jsx';
import { CARD_SURFACE, GRID_GAP, ITEM_ICON_LG, KIND_ICON } from '@/components/ui/tokens.js';
import { folderName } from '@/features/folders/folderTreeUtils.js';
import FilePreview from '@/features/documents/FilePreview.jsx';
import Tooltip from '@/components/ui/Tooltip.jsx';

/**
 * PublicShare — `/s/:token`. Standalone page (no AppShell, no login) that a relative opens from
 * a WhatsApp link, so it is built phone-first. It shows only titles and files — view or
 * download each one, or everything as a ZIP. Notes and passwords never reach this page.
 *
 * Must sit OUTSIDE the `<ProtectedRoute><AppShell/></ProtectedRoute>` tree. Renders its own
 * `Toaster` and `LanguageSwitcher` since the app chrome isn't here.
 */

function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
}

function countFiles(folder) {
  if (!folder) return 0;
  const own = (folder.documents || []).reduce((n, d) => n + (d.files?.length || 0), 0);
  return own + (folder.subfolders || []).reduce((n, sub) => n + countFiles(sub), 0);
}

function FileCard({ file, onOpen }) {
  const { t } = useTranslation(['shares', 'common']);
  const isImage = file.mimeType?.startsWith('image/');
  const Icon = isImage ? Image : file.mimeType === 'application/pdf' ? FileText : File;
  const fileName = file.label || file.originalName || t('public.untitledFile', 'File');

  return (
    <div className={`flex flex-col overflow-hidden ${CARD_SURFACE}`}>
      {/* Opens in the app's own viewer (images zoom, PDFs show on phones too). */}
      <Tooltip content={t('documents:tip.viewFile', 'See this file big')} className="grid">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('public.viewFile', 'Open {{name}}', { name: fileName })}
        className="flex aspect-[4/3] w-full items-center justify-center bg-neutral-50 dark:bg-neutral-900"
      >
        {isImage ? (
          <img src={filesApi.resolveUrl(file.thumbUrl || file.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Icon
            className={`${ITEM_ICON_LG} ${file.mimeType === 'application/pdf' ? KIND_ICON.pdf : KIND_ICON.document}`}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        )}
      </button>
      </Tooltip>
      <div className="flex flex-1 items-center gap-2 py-1 pl-3 pr-1">
        <div className="min-w-0 flex-1">
          <Tooltip content={fileName} onlyWhenOverflow className="flex min-w-0">
            <p className="min-w-0 truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">{fileName}</p>
          </Tooltip>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{formatBytes(file.size)}</p>
        </div>
        <Tooltip content={t('common:tip.download', 'Save a copy to your device')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => filesApi.triggerDownload(file.downloadUrl, file.originalName || file.label)}
            aria-label={t('public.downloadFile', 'Download {{name}}', { name: fileName })}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

function DocumentFiles({ doc, showTitle }) {
  const { t } = useTranslation('shares');
  const files = doc.files || [];
  const [previewIndex, setPreviewIndex] = useState(null);
  return (
    <section className="mb-4 sm:mb-6">
      {showTitle && (
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-200">
          <FileText className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          {doc.title}
        </h3>
      )}
      {files.length ? (
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${GRID_GAP}`}>
          {files.map((f, i) => <FileCard key={f.id} file={f} onOpen={() => setPreviewIndex(i)} />)}
        </div>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('public.noFiles', 'No files here.')}</p>
      )}
      {previewIndex !== null && <FilePreview files={files} startIndex={previewIndex} onClose={() => setPreviewIndex(null)} />}
    </section>
  );
}

function FolderSection({ folder, depth = 0 }) {
  const { t } = useTranslation('shares');
  if (!folder) return null;
  return (
    <div className={depth > 0 ? 'mt-2 border-l-2 border-neutral-200 pl-3 dark:border-neutral-800' : ''}>
      {depth > 0 && (
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          <Folder className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          {folderName(folder, t)}
        </h2>
      )}
      {(folder.documents || []).map((doc, i) => <DocumentFiles key={`${doc.title}-${i}`} doc={doc} showTitle />)}
      {(folder.subfolders || []).map((sub, i) => <FolderSection key={`${sub.name}-${i}`} folder={sub} depth={depth + 1} />)}
    </div>
  );
}

function CenteredMessage({ icon: Icon, title, description }) {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center px-4">
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
        <LanguageSwitcher />
      </div>
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
          <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h1>
        {description && <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
      </div>
    </div>
  );
}

export default function PublicShare() {
  const { t } = useTranslation(['shares', 'common']);
  const { token } = useParams();
  const [state, setState] = useState('loading');
  const [share, setShare] = useState(null);
  const [zipLoading, setZipLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    // The server may be waking up (WakeUpScreen covers that): retry the read quietly once it is.
    withWakeRetry(() => publicApi.getShare(token))
      .then((data) => {
        if (cancelled) return;
        setShare(data);
        setState('content');
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        const code = err?.response?.data?.code;
        if (status === 410 && code === 'REVOKED') setState('revoked');
        else if (status === 410) setState('expired');
        else if (status === 404) setState('notfound');
        else setState('error');
      });
    return () => { cancelled = true; };
  }, [token]);

  const title = share?.document?.title || folderName(share?.folderTree, t) || t('public.defaultTitle', 'Shared with you');

  const handleZipDownload = async () => {
    setZipLoading(true);
    try {
      const blob = await publicApi.zipLink(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('public.zipError', 'Could not download. Please try again.'));
    } finally {
      setZipLoading(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-[100dvh] bg-neutral-50 dark:bg-neutral-950" role="status" aria-busy="true">
        <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-8 sm:px-6 sm:pt-6">
          <Skeleton variant="line" width={120} className="mb-2" />
          <Skeleton className="h-7 w-3/5 sm:h-8" />
          <Skeleton variant="line" height={14} width="45%" className="mt-2 mb-4 sm:mb-6" />
          <div className={`grid grid-cols-2 sm:grid-cols-3 ${GRID_GAP}`} aria-hidden="true">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className={`overflow-hidden ${CARD_SURFACE}`}>
                <Skeleton rounded="none" className="aspect-[4/3] w-full" />
                <div className="space-y-2 p-3">
                  <Skeleton variant="line" width="70%" />
                  <Skeleton variant="line" width="30%" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (state === 'notfound') {
    return (
      <CenteredMessage
        icon={SearchX}
        title={t('public.notFound.title', 'Link not found')}
        description={t('public.notFound.description', 'This link does not exist. Check that you copied all of it.')}
      />
    );
  }
  if (state === 'expired') {
    return (
      <CenteredMessage
        icon={Clock}
        title={t('public.expired.title', 'This link has expired')}
        description={t('public.expired.description', 'Ask the person who sent it for a new link.')}
      />
    );
  }
  if (state === 'revoked') {
    return (
      <CenteredMessage
        icon={Ban}
        title={t('public.revoked.title', 'This link was turned off')}
        description={t('public.revoked.description', 'Ask the person who sent it for a new link.')}
      />
    );
  }
  if (state === 'error') {
    return (
      <CenteredMessage
        icon={Ban}
        title={t('public.error.title', 'Something went wrong')}
        description={t('public.error.description', 'Please try again in a moment.')}
      />
    );
  }

  const isFolder = Boolean(share.folderTree);
  const docFiles = share.document?.files || [];
  const fileCount = isFolder ? countFiles(share.folderTree) : docFiles.length;

  return (
    <div className="min-h-[100dvh] bg-neutral-50 dark:bg-neutral-950">
      <Toaster position="top-center" toastOptions={{ style: { overflowWrap: 'anywhere' } }} />
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-8 sm:px-6 sm:pt-6">
        <header className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
          <div className="min-w-0 flex-1">
            {share.familyName && (
              <p className="truncate text-xs font-medium uppercase tracking-wide text-primary-600 dark:text-primary-400">
                {share.familyName}
              </p>
            )}
            <h1 className="mt-1 flex items-center gap-2 break-words text-xl font-bold text-neutral-900 dark:text-neutral-100 sm:text-2xl">
              {isFolder && <Folder className="h-6 w-6 flex-shrink-0 text-neutral-400" aria-hidden="true" />}
              <span className="min-w-0">{title}</span>
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {fileCount === 1
                ? t('common:units.file_one', '{{count}} file', { count: fileCount })
                : t('common:units.file_other', '{{count}} files', { count: fileCount })}
              {share.expiresAt && ` · ${t('public.expiresAt', 'Link works until {{date}}', { date: formatDateTime(share.expiresAt) })}`}
            </p>
          </div>
          <div className="flex-shrink-0">
            <LanguageSwitcher />
          </div>
        </header>

        {(isFolder || docFiles.length > 1) && fileCount > 0 && (
          <Tooltip content={t('tip.downloadZip', 'Get all the files at once')} className="mb-4 flex sm:mb-6 sm:inline-flex">
            <Button
              onClick={handleZipDownload}
              loading={zipLoading}
              leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}
              className="w-full sm:w-auto"
            >
              {zipLoading ? t('public.preparingZip', 'Preparing…') : t('public.downloadZip', 'Download all (ZIP)')}
            </Button>
          </Tooltip>
        )}

        {isFolder ? (
          fileCount > 0 ? (
            <FolderSection folder={share.folderTree} />
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('public.noFiles', 'No files here.')}</p>
          )
        ) : (
          <DocumentFiles doc={share.document || {}} />
        )}
      </div>
    </div>
  );
}
