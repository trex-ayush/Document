import { useEffect, useRef, useState } from 'react';
import { env } from '@/config/env.js';

/**
 * GoogleSignInButton — renders the official Google Identity Services (GIS)
 * "Sign in with Google" button. Page-specific (not a `components/ui`
 * primitive — only Login/Signup use it), so it lives here in pages/auth/.
 *
 * - Loads `https://accounts.google.com/gsi/client` lazily, once, only when
 *   this component mounts (Login or Signup — never globally).
 * - Renders **nothing** when `VITE_GOOGLE_CLIENT_ID` is empty/unset, per the
 *   spec ("don't render broken UI").
 * - The button's width tracks its container via `ResizeObserver` (GIS's
 *   `renderButton` only accepts a pixel width, not `100%`) so it looks
 *   right from 360px phones up through desktop, clamped to Google's
 *   supported 200-400px range.
 * - `enableOneTap` additionally calls `google.accounts.id.prompt()` — pass
 *   this on the Login page only, per the spec.
 *
 * Props: onCredential(credential: string), enableOneTap? (default false), text? (GIS button text variant, default 'continue_with')
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
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return gisScriptPromise;
}

export default function GoogleSignInButton({ onCredential, enableOneTap = false, text = 'continue_with' }) {
  const containerRef = useRef(null);
  const [scriptReady, setScriptReady] = useState(false);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!env.googleClientId) return undefined;
    let cancelled = false;
    loadGoogleIdentityScript()
      .then(() => {
        if (!cancelled) setScriptReady(true);
      })
      .catch(() => {
        // GIS failed to load (offline, blocked script, etc.) — button just
        // doesn't render; email/password sign-in still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scriptReady || !env.googleClientId || !containerRef.current) return undefined;
    const { google } = window;

    google.accounts.id.initialize({
      client_id: env.googleClientId,
      callback: (response) => onCredentialRef.current?.(response.credential),
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    const renderButton = () => {
      const el = containerRef.current;
      if (!el) return;
      el.innerHTML = '';
      const measured = el.offsetWidth || 300;
      const width = Math.min(400, Math.max(200, Math.floor(measured)));
      google.accounts.id.renderButton(el, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        logo_alignment: 'left',
        text,
        width,
      });
    };

    renderButton();
    const ro = new ResizeObserver(() => renderButton());
    ro.observe(containerRef.current);

    if (enableOneTap) {
      google.accounts.id.prompt();
    }

    return () => ro.disconnect();
  }, [scriptReady, enableOneTap, text]);

  if (!env.googleClientId) return null;

  return <div ref={containerRef} className="w-full flex justify-center" />;
}

/** Small "or" divider used between the Google button and the email/password form. */
export function AuthDivider({ label = 'or' }) {
  return (
    <div className="flex items-center gap-3 my-5" role="separator" aria-label={label}>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
      <span className="text-xs uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{label}</span>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
    </div>
  );
}
