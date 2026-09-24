import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { publicApi } from '@/services/publicApi.js';
import { filesApi } from '@/services/filesApi.js';

/**
 * PublicShare — `/s/:token`. Renders completely standalone: no `AppShell`,
 * no `ProtectedRoute`, no assumption the visitor is logged in or even has a
 * Family Vault account. This is the page a relative opens from a WhatsApp
 * link on their phone, so it's built mobile-first (full width, large tap
 * targets, no desktop-only affordances).
 *
 * IMPORTANT for the lead wiring AppRouter.jsx: this route must sit OUTSIDE
 * the `<ProtectedRoute><AppShell/></ProtectedRoute>` tree entirely — see
 * this agent's final report.
 *
 * `Toaster` is normally mounted once in main.jsx (still active on this
 * route since it wraps `<AppRouter/>`), but this file renders its own
 * scoped one too as a defensive fallback in case a future refactor moves
 * this page's mount point outside that tree — a harmless no-op otherwise
 * since react-hot-toast's toast() calls are routed to whichever Toaster is
 * mounted.
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

function FileIcon({ mimeType }) {
  const isImage = mimeType?.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  return (
    <svg className="w-8 h-8 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      {isImage ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 7.5h18M3 4.5h18M3.75 3h16.5A2.25 2.25 0 0122.5 5.25v13.5A2.25 2.25 0 0120.25 21H3.75A2.25 2.25 0 011.5 18.75V5.25A2.25 2.25 0 013.75 3z" />
      ) : isPdf ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3h7.5m-9-9h.008v.008H6.75V13.5zm0 3h.008v.008H6.75V16.5zm0 3h.008v.008H6.75V19.5zM8.25 21h7.5A2.25 2.25 0 0018 18.75V7.5L14.25 3.75H8.25A2.25 2.25 0 006 6v12.75A2.25 2.25 0 008.25 21z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25A2.25 2.25 0 006 6v12.75A2.25 2.25 0 008.25 21h7.5A2.25 2.25 0 0018 18.75V14.25h1.5z" />
      )}
    </svg>
  );
}

function FileCard({ file, allowDownload }) {
  const isImage = file.mimeType?.startsWith('image/');
  const viewUrl = filesApi.resolveUrl(file.url);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden flex flex-col">
      <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="block bg-neutral-50 dark:bg-neutral-900 aspect-square flex items-center justify-center">
        {isImage ? (
          <img src={filesApi.resolveUrl(file.thumbUrl || file.url)} alt={file.label || ''} className="w-full h-full object-cover" />
        ) : (
          <FileIcon mimeType={file.mimeType} />
        )}
      </a>
      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate" title={file.label}>
          {file.label || 'Untitled'}
        </p>
        <p className="text-[11px] text-neutral-400">{formatBytes(file.size)}</p>
        {allowDownload && (
          <button
            type="button"
            onClick={() => filesApi.triggerDownload(file.downloadUrl, file.label)}
            className="mt-auto min-h-[36px] text-xs font-medium rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
          >
            Download
          </button>
        )}
      </div>
    </div>
  );
}

function FolderSection({ folder, allowDownload, depth = 0 }) {
  if (!folder) return null;
  return (
    <div className={depth > 0 ? 'mt-4 pl-3 border-l-2 border-neutral-100 dark:border-neutral-800' : ''}>
      {depth > 0 && <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">{folder.name}</h3>}
      {(folder.documents || []).map((doc) => (
        <div key={doc.id || doc.title} className="mb-4">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">{doc.title}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(doc.files || []).map((f) => (
              <FileCard key={f.id} file={f} allowDownload={allowDownload} />
            ))}
          </div>
        </div>
      ))}
      {(folder.subfolders || []).map((sub) => (
        <FolderSection key={sub.name} folder={sub} allowDownload={allowDownload} depth={depth + 1} />
      ))}
    </div>
  );
}

function CenteredMessage({ icon, title, description }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400">
          {icon}
        </div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h1>
        {description && <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">{description}</p>}
      </div>
    </div>
  );
}

const LockIcon = (p) => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);
const ClockIcon = (p) => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const SlashIcon = (p) => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
);
const SearchXIcon = (p) => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...p}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

export default function PublicShare() {
  const { token } = useParams();
  const [state, setState] = useState('loading');
  const [share, setShare] = useState(null);
  const [password, setPassword] = useState('');
  const [verifiedPassword, setVerifiedPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);

  const fetchShare = useCallback(
    async (pwd) => {
      try {
        const data = await publicApi.getShare(token, pwd);
        setShare(data);
        setVerifiedPassword(pwd || '');
        setState('content');
      } catch (err) {
        const status = err?.response?.status;
        const code = err?.response?.data?.code;
        if (status === 401 && code === 'PASSWORD_REQUIRED') {
          setState('password');
        } else if (status === 401 && code === 'PASSWORD_INVALID') {
          setPasswordError('Incorrect password — try again.');
          setState('password');
        } else if (status === 429) {
          setState('locked');
        } else if (status === 410 && code === 'REVOKED') {
          setState('revoked');
        } else if (status === 410) {
          setState('expired');
        } else if (status === 404) {
          setState('notfound');
        } else {
          setState('error');
        }
      }
    },
    [token],
  );

  useEffect(() => {
    fetchShare();
  }, [fetchShare]);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setPasswordError('');
    await fetchShare(password);
    setSubmitting(false);
  };

  const handleZipDownload = async () => {
    setZipLoading(true);
    try {
      const blob = await publicApi.zipLink(token, verifiedPassword);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${share?.document?.title || share?.folderTree?.name || 'share'}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      let message = 'Could not download the ZIP.';
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          message = parsed.message || message;
        } catch {
          // non-JSON error body — keep the generic message
        }
      }
      toast.error(message);
    } finally {
      setZipLoading(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state === 'notfound') {
    return <CenteredMessage icon={<SearchXIcon />} title="Link not found" description="This share link doesn't exist. Double-check the URL you were given." />;
  }
  if (state === 'expired') {
    return <CenteredMessage icon={<ClockIcon />} title="This link has expired" description="Ask whoever shared this with you to send a new link." />;
  }
  if (state === 'revoked') {
    return <CenteredMessage icon={<SlashIcon />} title="This link was revoked" description="The person who shared this has turned off access. Ask them to send a new link." />;
  }
  if (state === 'locked') {
    return <CenteredMessage icon={<LockIcon />} title="Too many attempts" description="This link has been temporarily locked after several incorrect passwords. Please try again in about 15 minutes." />;
  }
  if (state === 'error') {
    return <CenteredMessage icon={<SlashIcon />} title="Something went wrong" description="Please try again in a moment." />;
  }

  if (state === 'password') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4">
        <Toaster position="top-center" />
        <div className="w-full max-w-sm">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400">
            <LockIcon />
          </div>
          <h1 className="text-lg font-semibold text-center text-neutral-900 dark:text-neutral-100 mb-1">Password required</h1>
          <p className="text-sm text-center text-neutral-500 dark:text-neutral-400 mb-5">
            This link is protected. Enter the password given to you to view it.
          </p>
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full min-h-[44px] rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3.5 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            {passwordError && <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
            <button
              type="submit"
              disabled={submitting || !password}
              className="w-full min-h-[44px] rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white font-medium text-sm transition-colors"
            >
              {submitting ? 'Checking…' : 'View'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // state === 'content'
  const title = share.document?.title || share.folderTree?.name || share.label || 'Shared with you';
  const files = share.document?.files || [];
  const hasMultipleFiles = files.length > 1 || (share.folderTree && true);

  return (
    <div className="min-h-[100dvh] bg-neutral-50 dark:bg-neutral-950">
      <Toaster position="top-center" />
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-600 dark:text-primary-400">{share.familyName}</p>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{title}</h1>
          {share.label && <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{share.label}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-neutral-400">
            {share.expiresAt ? <span>Expires {new Date(share.expiresAt).toLocaleString()}</span> : <span>No expiry</span>}
            {!share.allowDownload && <span>· Preview only</span>}
          </div>
        </header>

        {share.allowDownload && hasMultipleFiles && (
          <button
            type="button"
            onClick={handleZipDownload}
            disabled={zipLoading}
            className="mb-5 w-full sm:w-auto min-h-[44px] px-4 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium disabled:opacity-60"
          >
            {zipLoading ? 'Preparing ZIP…' : 'Download all as ZIP'}
          </button>
        )}

        {share.folderTree ? (
          <FolderSection folder={share.folderTree} allowDownload={share.allowDownload} />
        ) : files.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {files.map((f) => (
              <FileCard key={f.id} file={f} allowDownload={share.allowDownload} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No files in this share.</p>
        )}
      </div>
    </div>
  );
}
