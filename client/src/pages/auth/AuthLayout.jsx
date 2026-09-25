import { FileText, Link2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.jsx';
import { CARD_PADDING, CARD_SURFACE } from '@/components/ui/tokens.js';

/**
 * AuthLayout — shared shell for Login/Signup/ForgotPassword/ResetPassword/AcceptInvite (and
 * `pages/Onboarding.jsx`'s "Create your family"). Not a UI primitive (auth-page-specific), so it
 * lives in pages/auth/.
 *
 * PC (`lg` and up) is a split screen:
 *  - left half: a full-height family photo with a soft coral-tinted overlay, the Family Vault
 *    logo, a short tagline and three benefit points (English and Hindi);
 *  - right half: the page's title, the standard card with the form, and the footer link, centred.
 * Phones and tablets get no photo — nothing is downloaded there (the `<picture>` sources only
 * match from `lg`) — just a slim header with the logo, and the form uses the full width.
 *
 * The language switch stays visible top-right on every size: these screens have no other chrome,
 * and a family member who reads Hindi needs to switch before signing in.
 *
 * Photos live in client/public/assets/auth/ (credits and file sizes in CREDITS.md there): 4:5
 * crops, AVIF (WebP fallback) at 1200, 1920 and 2880 wide, picked by `srcset`/`sizes`; a tiny
 * blurred copy sits behind each while it loads.
 *
 * Props: title, subtitle?, children, footer?, photo? ('family' | 'paperwork', default
 * 'paperwork'), heroImage? (decorative illustration shown above the title on phones only, e.g.
 * Onboarding's `/assets/welcome-onboarding.png` — PC shows the photo panel instead).
 */

/**
 * The two photos (4:5 crops, AVIF with a WebP fallback at 1200/1920/2880 wide) and a tiny blurred
 * copy of each, shown behind the panel while the real photo loads. `position` keeps faces in view
 * when `object-cover` trims the top and bottom on wide screens.
 */
const PHOTOS = {
  family: {
    name: 'family-portrait',
    position: 'object-[50%_30%]',
    placeholder: 'data:image/webp;base64,UklGRrwAAABXRUJQVlA4ILAAAABQBACdASoQABQAPrVInkmnJCKhMAgA4BaJagAjzMcmZBw2XWF+fDvY8NAQAP7yB1TJmjnMUSdPv2iKzDeavruPNW8J96SltkVP36PZ3tTxu75s1yce+6gscsSC+7tV4wi2dEvJRdy09yOcLX/z3G8FzZKPZ7W2hfmw3ETJg7nnkQCiev2z9Diu8X+wa3juVCnrDuZ8xBL0Aqlxd6JP8QMPWsCUUCvKkMm17EKK/5AAAA==',
  },
  paperwork: {
    name: 'couple-paperwork',
    position: 'object-[50%_35%]',
    placeholder: 'data:image/webp;base64,UklGRtQAAABXRUJQVlA4IMgAAADQBACdASoQABQAPrVInkmnJCKhMAgA4BaJZACdMoR4KGVjlAoSPiOqmHugw2DZoAD+sNMs5C9PaOTGbJOyE7JNlbw7aztvyEc/TKV03Wblt148qRZZrMPAZmvEYvVceU7GWludfy7flUratpM3k02/en8wbhKk/hJj6SHkuXzc+FGleiKulEUAi2RFwBJk/sDv4n/wJ5+ZU49HuFWI/kl9edP+OBkXo77hIF57xNbrx+0Ii9T4g9myyxOh35mWtv3hJIACBAAAAA==',
  },
};

const srcSet = (name, ext) => [1200, 1920, 2880].map((w) => `/assets/auth/${name}-${w}.${ext} ${w}w`).join(', ');
/** The panel is half the screen from `lg`; below that it isn't shown and nothing is downloaded. */
const PANEL_MEDIA = '(min-width: 1024px)';
const PANEL_SIZES = '50vw';
/** 1×1 transparent GIF — the `<img>` fallback, so phones (no `<source>` matches) fetch nothing. */
const EMPTY_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Link style for the auth pages' text links ("Forgot password?", "Create one", "Sign in"). */
export const AUTH_LINK =
  'rounded-sm font-medium text-primary-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 dark:text-primary-400';

function BrandMark({ onPhoto = false }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          onPhoto ? 'bg-white/95 shadow-soft-sm' : 'bg-white shadow-soft-sm ring-1 ring-neutral-200 dark:ring-neutral-700'
        }`}
      >
        <img src="/assets/logo.png" alt="" width={256} height={234} decoding="async" className="h-7 w-auto" />
      </span>
      <span className={`text-base font-bold ${onPhoto ? 'text-white' : 'text-neutral-900 dark:text-neutral-100'}`}>Family Vault</span>
    </span>
  );
}

function PhotoPanel({ photo }) {
  const { t } = useTranslation('auth');
  const { name, position, placeholder } = PHOTOS[photo] || PHOTOS.paperwork;
  const benefits = [
    { icon: FileText, text: t('layout.benefitDocs', 'Aadhaar, PAN, passports — all in one safe place') },
    { icon: ShieldCheck, text: t('layout.benefitPrivate', 'Only your family can see them') },
    { icon: Link2, text: t('layout.benefitShare', 'Share with a link that expires on its own') },
  ];
  return (
    <aside
      style={{ backgroundImage: `url(${placeholder})` }}
      className="relative hidden overflow-hidden bg-primary-900 bg-cover bg-center lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col lg:justify-between lg:p-10 xl:p-12"
    >
      <picture className="absolute inset-0">
        <source media={PANEL_MEDIA} type="image/avif" srcSet={srcSet(name, 'avif')} sizes={PANEL_SIZES} />
        <source media={PANEL_MEDIA} type="image/webp" srcSet={srcSet(name, 'webp')} sizes={PANEL_SIZES} />
        {/* Above the fold on PC, so loaded straight away and first. */}
        <img
          src={EMPTY_IMG}
          width={2880}
          height={3600}
          alt=""
          fetchPriority="high"
          decoding="async"
          draggable={false}
          className={`absolute inset-0 h-full w-full select-none object-cover ${position}`}
        />
      </picture>
      {/* A soft coral tint, then a fade at the top (logo) and a deeper one at the bottom (text). */}
      <div aria-hidden="true" className="absolute inset-0 bg-primary-900/15 mix-blend-multiply" />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-b from-neutral-950/50 via-neutral-950/0 via-35% to-neutral-950/90"
      />

      <div className="relative">
        <BrandMark onPhoto />
      </div>

      <div className="relative max-w-md text-white">
        <p className="text-2xl font-bold leading-snug xl:text-3xl">{t('layout.tagline', "Your family's important papers, safe and always at hand")}</p>
        <ul className="mt-6 space-y-3">
          {benefits.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-white/90">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export default function AuthLayout({ title, subtitle, children, footer, photo = 'paperwork', heroImage }) {
  return (
    <div className="min-h-[100dvh] bg-neutral-50 lg:grid lg:grid-cols-2 dark:bg-neutral-950">
      <PhotoPanel photo={photo} />

      <main className="flex min-h-[100dvh] flex-col px-4 py-4 sm:px-6 lg:px-10">
        <header className="flex items-center justify-between gap-3">
          <span className="lg:invisible">
            <BrandMark />
          </span>
          <LanguageSwitcher />
        </header>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <div className="w-full max-w-md">
            <div className="mb-5 text-center sm:mb-6">
              {heroImage && (
                // Decorative welcome illustration (1536×1024) — phones only; PC has the photo panel.
                <img
                  src={heroImage}
                  alt=""
                  width={1536}
                  height={1024}
                  decoding="async"
                  draggable={false}
                  className="mx-auto mb-4 h-auto w-full max-w-[220px] select-none sm:max-w-[260px] lg:hidden"
                />
              )}
              <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl dark:text-neutral-100">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
            </div>

            <div className={`${CARD_SURFACE} ${CARD_PADDING}`}>{children}</div>

            {footer && <div className="mt-5 text-center text-sm text-neutral-500 sm:mt-6 dark:text-neutral-400">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
