import { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { env } from '@/config/env.js';
import ThemeContext from '@/context/ThemeContext.jsx';

/**
 * GoogleSignInButton — Google's own "Continue with Google" button from Google Identity Services
 * (GIS), sized and themed to sit with our form. Page-specific (Login, Signup, AcceptInvite), so
 * it lives in pages/auth/.
 *
 * Why Google's rendered button and not a hand-drawn one: our server signs people in with the
 * ID token (`credential`) that GIS hands to `callback`. GIS only produces that token from its own
 * button (or One Tap, which Google may silently suppress), so a custom `<button>` can't start the
 * same flow reliably — and hiding Google's button under ours is fragile and against Google's
 * guidelines. Google's button already follows Google's branding rules (multicolour "G", the
 * approved wording, light and dark variants), so we keep it and fit it in:
 *  - `theme` follows the app: `outline` (white, grey border) in light, `filled_black` in dark;
 *  - `locale` follows the app language, so Hindi readers get Google's Hindi wording;
 *  - `size: large` (40px — our button height from `lg`), `shape: rectangular`, logo on the left;
 *  - width tracks the container (GIS takes pixels only, 200–400px), centred in a row as tall as
 *    our buttons, so the page doesn't jump.
 * While Google's script loads, a look-alike placeholder (inline multicolour "G", same size and
 * wording, not clickable) holds the space; it disappears once Google's button has drawn.
 *
 * - Loads `https://accounts.google.com/gsi/client` lazily, once, only when this mounts.
 * - Renders **nothing** when `VITE_GOOGLE_CLIENT_ID` is unset, or when Google's script can't load
 *   (offline, blocked) — email and password sign-in still works.
 * - `enableOneTap` also calls `google.accounts.id.prompt()` (Login only).
 *
 * Props: onCredential(credential: string), enableOneTap? (default false), text? (GIS text
 * variant: 'continue_with' default, or 'signin_with')
 *
 * @example
 * <GoogleSignInButton onCredential={handleGoogleCredential} enableOneTap />
 */
let gisScriptPromise = null;
function loadGoogleIdentityScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;
  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity-services]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentityServices = 'true';
    script.onload = () => resolve();
    script.onerror = () => {
      gisScriptPromise = null;
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return gisScriptPromise;
}

/** Google's multicolour "G" (official brand colours), for the loading placeholder. */
function GoogleGLogo({ className = 'h-[18px] w-[18px]' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Pixel width GIS accepts (200–400), from the row's measured width. */
const buttonWidth = (el) => Math.min(400, Math.max(200, Math.floor(el?.offsetWidth || 300)));

export default function GoogleSignInButton({ onCredential, enableOneTap = false, text = 'continue_with' }) {
  const { t, i18n } = useTranslation('auth');
  const isDark = useContext(ThemeContext)?.isDark ?? false;
  const locale = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
  const rowRef = useRef(null);
  const containerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'failed'
  const [drawn, setDrawn] = useState(false);
  const [width, setWidth] = useState(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!env.googleClientId) return undefined;
    let cancelled = false;
    loadGoogleIdentityScript()
      .then(() => !cancelled && setStatus('ready'))
      .catch(() => !cancelled && setStatus('failed'));
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialise once per page (and show One Tap on Login) — not again on a theme/language change.
  useEffect(() => {
    if (status !== 'ready' || !env.googleClientId) return;
    const { google } = window;
    google.accounts.id.initialize({
      client_id: env.googleClientId,
      callback: (response) => onCredentialRef.current?.(response.credential),
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    if (enableOneTap) google.accounts.id.prompt();
  }, [status, enableOneTap]);

  // Track the row's width (GIS only takes a pixel width).
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    setWidth(buttonWidth(row));
    const ro = new ResizeObserver(() => setWidth(buttonWidth(row)));
    ro.observe(row);
    return () => ro.disconnect();
  }, [status]);

  // Draw (and redraw on width, theme or language change) Google's button.
  useEffect(() => {
    const el = containerRef.current;
    if (status !== 'ready' || !env.googleClientId || !el || !width) return undefined;
    el.innerHTML = '';
    window.google.accounts.id.renderButton(el, {
      type: 'standard',
      theme: isDark ? 'filled_black' : 'outline',
      size: 'large',
      shape: 'rectangular',
      logo_alignment: 'left',
      text,
      width,
      locale,
    });
    // Keep the placeholder up until Google's iframe has actually painted.
    const iframe = el.querySelector('iframe');
    const done = () => setDrawn(true);
    const fallback = setTimeout(done, 2500);
    iframe?.addEventListener('load', done, { once: true });
    if (!iframe) done();
    return () => {
      clearTimeout(fallback);
      iframe?.removeEventListener('load', done);
    };
  }, [status, width, isDark, text, locale]);

  if (!env.googleClientId || status === 'failed') return null;

  const label = text === 'signin_with' ? t('google.signInWith', 'Sign in with Google') : t('google.continueWith', 'Continue with Google');

  return (
    <div ref={rowRef} className="relative flex min-h-11 w-full items-center justify-center lg:min-h-10">
      {!drawn && (
        // Same size, colours and wording as Google's button, so nothing jumps when it swaps in.
        <div
          role="status"
          aria-label={label}
          style={{ width: width || '100%', maxWidth: 400 }}
          className={`pointer-events-none absolute inset-y-0 my-auto flex h-10 items-center justify-center gap-2.5 rounded-[4px] border px-3 text-sm font-medium ${
            isDark ? 'border-[#202124] bg-[#202124] text-white' : 'border-[#dadce0] bg-white text-[#3c4043]'
          }`}
        >
          <GoogleGLogo />
          <span>{label}</span>
        </div>
      )}
      <div ref={containerRef} className={`flex h-10 justify-center transition-opacity ${drawn ? 'opacity-100' : 'opacity-0'}`} style={{ colorScheme: 'normal' }} />
    </div>
  );
}

/** "or" divider between the Google button and the email/password form. */
export function AuthDivider({ label }) {
  const { t } = useTranslation('auth');
  const text = label ?? t('google.or', 'or');
  return (
    <div className="my-5 flex items-center gap-3" role="separator" aria-label={text}>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
      <span className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{text}</span>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
    </div>
  );
}
