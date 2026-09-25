import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, Lock, RotateCw, WifiOff } from 'lucide-react';
import { getServerWakeState, retryServerWake, subscribeServerWake } from '@/services/serverWake.js';
import { wakePhase, wakeProgress, wakeStatusIndex } from '@/services/serverWakeTiming.js';

/**
 * WakeUpScreen — full-screen "opening your vault" screen shown while the sleeping API server
 * starts up (~1 minute on the free host after 15 quiet minutes). Mounted once in main.jsx, so it
 * covers every route including the public share page `/s/:token`.
 *
 * Invisible for the first 2.5s (a fast answer never flashes it), hides the moment the server
 * answers, and after 75s without an answer switches to "Still starting… check your internet"
 * with a big Try again button. Sits above the toasts (react-hot-toast uses z-index 9999).
 */

const STATUS = [
  ['waking', 'Waking up your family vault…'],
  ['opening', 'Opening it safely…'],
  ['preparing', 'Getting your documents ready…'],
  ['almost', 'Almost there…'],
];

// Only features that exist: + Add sheet (MobileTabBar), expiring share links (ShareDialog), the
// language button in the phone top bar (Navbar), Bin and Resize & compress in the More drawer.
const APP_TIPS = [
  ['add', 'Tap + Add at the bottom to save a document, photo, password or note.'],
  ['share', 'Share a document with a link that switches off by itself.'],
  ['language', 'Tap “हिन्दी” at the top to use the app in Hindi.'],
  ['bin', 'Deleted something by mistake? Bring it back from Bin, under More.'],
  ['resize', 'Photo too big for a form? Make it smaller with Resize & compress, under More.'],
];
// The public share page has none of the app chrome: tips about what is on that page instead.
const SHARE_TIPS = [
  ['shareOpen', 'Tap a file to open it, or the download arrow to save it.'],
  ['shareZip', 'Many files? “Download all (ZIP)” saves them in one go.'],
];

const TIP_EVERY_MS = 6_000;
const TICK_MS = 500;

const STYLES = `
@keyframes fv-wake-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes fv-wake-spin { to { transform: rotate(360deg); } }
@keyframes fv-wake-glow { 0%, 100% { opacity: .55; transform: scale(.92); } 50% { opacity: .9; transform: scale(1.06); } }
.fv-wake-breathe { animation: fv-wake-breathe 3.2s ease-in-out infinite; }
.fv-wake-spin { animation: fv-wake-spin 2.4s linear infinite; }
.fv-wake-glow { animation: fv-wake-glow 3.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .fv-wake-breathe, .fv-wake-spin, .fv-wake-glow { animation: none; }
}
`;

function LogoMark({ alt }) {
  return (
    <div className="relative mx-auto flex h-40 w-40 items-center justify-center">
      <div aria-hidden="true" className="fv-wake-glow absolute inset-3 rounded-full bg-primary-200/70 blur-2xl dark:bg-primary-500/25" />
      <svg aria-hidden="true" viewBox="0 0 100 100" className="fv-wake-spin absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2" className="stroke-primary-100 dark:stroke-neutral-800" />
        <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="72 217" className="stroke-primary-500" />
      </svg>
      <div className="fv-wake-breathe relative flex h-28 w-28 items-center justify-center rounded-full bg-white shadow-lg shadow-primary-500/15 ring-1 ring-primary-100 dark:bg-neutral-900 dark:shadow-black/30 dark:ring-neutral-800">
        <img src="/assets/logo.png" alt={alt} width={256} height={234} decoding="async" className="h-16 w-auto" />
      </div>
    </div>
  );
}

function PrivateRow({ t }) {
  return (
    <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
      <Lock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      {t('wake.private', 'Your documents stay encrypted and private')}
    </p>
  );
}

function WakeUpView({ phase, elapsedMs }) {
  const { t } = useTranslation('common');
  const isSharePage = window.location.pathname.startsWith('/s/');
  const tips = isSharePage ? SHARE_TIPS : APP_TIPS;
  // Start on a different tip each visit so people who open the app weekly see something new.
  const [tipOffset] = useState(() => Math.floor(Math.random() * APP_TIPS.length));
  const [tipKey, tipFallback] = tips[(tipOffset + Math.floor(elapsedMs / TIP_EVERY_MS)) % tips.length];
  const [statusKey, statusFallback] = STATUS[wakeStatusIndex(elapsedMs)];
  const progress = wakeProgress(elapsedMs);
  const slow = phase === 'slow';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wake-title"
      className="fixed inset-0 z-[10000] overflow-y-auto bg-white dark:bg-neutral-950"
    >
      <style>{STYLES}</style>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-gradient-to-b from-primary-50 via-white to-white dark:from-primary-900/25 dark:via-neutral-950 dark:to-neutral-950"
      />
      <div className="relative flex min-h-full flex-col items-center justify-center px-4 pb-[calc(var(--safe-bottom)+2rem)] pt-[calc(var(--safe-top)+2rem)]">
        <div className="w-full max-w-sm text-center">
          {slow ? (
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-primary-50 text-primary-600 ring-8 ring-primary-50/60 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-900/10">
              <WifiOff className="h-11 w-11" strokeWidth={1.75} aria-hidden="true" />
            </div>
          ) : (
            <LogoMark alt={t('appName', 'Family Vault')} />
          )}

          <h1
            id="wake-title"
            aria-live="polite"
            className="mt-7 text-2xl font-semibold text-neutral-900 dark:text-neutral-50"
          >
            {slow ? t('wake.slowTitle', 'Still starting…') : t('wake.title', 'Just a moment')}
          </h1>

          {slow ? (
            <>
              <p className="mt-2 text-base text-neutral-600 dark:text-neutral-300">
                {t('wake.slowBody', 'Please check your internet, then try again.')}
              </p>
              <button
                type="button"
                onClick={retryServerWake}
                className="mt-7 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-6 text-base font-semibold text-white shadow-sm hover:bg-primary-600 active:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950"
              >
                <RotateCw className="h-5 w-5" aria-hidden="true" />
                {t('wake.tryAgain', 'Try again')}
              </button>
              <PrivateRow t={t} />
            </>
          ) : (
            <>
              <p
                key={statusKey}
                className="animate-fade-in mt-2 min-h-[1.5rem] text-base text-neutral-600 dark:text-neutral-300"
              >
                {t(`wake.status.${statusKey}`, statusFallback)}
              </p>

              <div className="mx-auto mt-6 w-full max-w-[240px]">
                <div
                  role="progressbar"
                  aria-label={t('wake.progressLabel', 'Opening the app')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress)}
                  className="h-1 overflow-hidden rounded-full bg-primary-100 dark:bg-neutral-800"
                >
                  <div
                    className="h-full rounded-full bg-primary-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {t('wake.firstTime', 'This can take up to a minute the first time')}
                </p>
              </div>

              <PrivateRow t={t} />

              <div className="mt-8 min-h-[88px] rounded-2xl border border-neutral-200/80 bg-white/80 p-4 text-left shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
                <div key={tipKey} className="animate-fade-in flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                    <Lightbulb className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-50">
                      {t('wake.tipLabel', 'Tip')}:{' '}
                    </span>
                    {t(`wake.tips.${tipKey}`, tipFallback)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WakeUpScreen() {
  const wake = useSyncExternalStore(subscribeServerWake, getServerWakeState);
  const [, setTick] = useState(0);

  // Re-render twice a second only while waiting; stops as soon as the server has answered.
  useEffect(() => {
    if (wake.awake) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [wake.awake]);

  const elapsedMs = wake.startedAt ? Math.max(0, Date.now() - wake.startedAt) : 0;
  const phase = wakePhase({ awake: wake.awake, elapsedMs, online: wake.online });
  if (phase === 'hidden') return null;
  return <WakeUpView phase={phase} elapsedMs={elapsedMs} />;
}
