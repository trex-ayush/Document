import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';

const RELOAD_FLAG = 'family-vault-chunk-reload';

/**
 * A page's code failed to load. Almost always because a new version was deployed while this tab
 * still had the old one open (its files no longer exist on the server). A single reload fixes it.
 */
function isStaleChunkError(error) {
  const msg = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed/i.test(msg);
}

/**
 * RouteErrorPage — shown instead of React Router's developer error screen when a page crashes.
 *
 *  - Stale code after a deploy: reloads once by itself (guarded so it can't loop).
 *  - Anything else: a calm message ("your documents are safe"), Try again and Go to Home. The
 *    technical message only shows in local development.
 *
 * `inShell`: rendered inside the app frame (navbar and menu stay), so it skips the full-screen
 * background.
 */
export default function RouteErrorPage({ inShell = false }) {
  const error = useRouteError();
  const { t } = useTranslation('common');
  const stale = isStaleChunkError(error);

  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return; // already tried once — show the page instead
      sessionStorage.setItem(RELOAD_FLAG, '1');
    } catch {
      return;
    }
    window.location.reload();
  }, [stale]);

  // A page that loaded fine clears the one-reload guard for next time.
  useEffect(() => {
    if (stale) return undefined;
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* storage unavailable — nothing to clear */
    }
    return undefined;
  }, [stale]);

  const title = stale
    ? t('errorPage.updatedTitle', 'A new version is ready')
    : t('errorPage.title', 'Something went wrong');
  const message = stale
    ? t('errorPage.updatedMessage', 'Family Vault was just updated. Please reload to continue.')
    : t('errorPage.message', "Don't worry — your documents and passwords are safe. Please try again.");

  return (
    <div
      className={
        inShell
          ? 'flex min-h-[60vh] items-center justify-center px-4 py-10'
          : 'flex min-h-[100dvh] items-center justify-center bg-neutral-50 px-4 py-10 dark:bg-neutral-950'
      }
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-neutral-700 dark:bg-neutral-900">
        {inShell ? (
          <span className="mx-auto flex h-12 w-12 items-center justify-center text-amber-500" aria-hidden="true">
            <AlertTriangle className="h-10 w-10" strokeWidth={1.75} />
          </span>
        ) : (
          <img src="/assets/logo.png" alt="Family Vault" width="56" height="51" className="mx-auto h-auto w-14" />
        )}
        <h1 className="mt-4 text-xl font-bold text-neutral-900 dark:text-neutral-100">{title}</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{message}</p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button leftIcon={<RotateCw className="h-4 w-4" />} onClick={() => window.location.reload()}>
            {stale ? t('errorPage.reload', 'Reload') : t('errorPage.tryAgain', 'Try again')}
          </Button>
          <Button as={Link} to="/" variant="secondary" leftIcon={<Home className="h-4 w-4" />} reloadDocument>
            {t('errorPage.home', 'Go to Home')}
          </Button>
        </div>

        {import.meta.env.DEV && error && (
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-xs text-neutral-500">Technical details (only shown while developing)</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-100 p-3 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {String(error?.stack || error?.message || error?.statusText || error)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
