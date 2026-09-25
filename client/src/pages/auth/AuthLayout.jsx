import { FileText, Link2, Lock, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.jsx';
import { Skeleton } from '@/components/ui/Skeleton.jsx';
import { CARD_PADDING, ICON_TILE, ICON_TILE_ICON, KIND_TONE } from '@/components/ui/tokens.js';

/**
 * AuthLayout — shared shell for Login/Signup/ForgotPassword/ResetPassword/AcceptInvite (and
 * `pages/Onboarding.jsx`'s "Create your family"). Not a UI primitive (auth-page-specific), so it
 * lives in pages/auth/.
 *
 * PC (`lg` and up) is a split screen:
 *  - left half: a full-height family photo with a soft coral-tinted overlay, the Family Vault
 *    logo, a short tagline and three benefit points (English and Hindi);
 *  - right half: the page's title, the card with the form, and the footer link, centred.
 *
 * Phones and tablets (below `lg`):
 *  - a photo hero across the top (~42% of the screen height, `svh` so browser bars don't
 *    change it) with the logo top-left and the language switch top-right, fading into the page;
 *  - the card slides up over the bottom of the hero (rounded, soft shadow), with the title and
 *    subtitle inside it;
 *  - under it, the three benefits as a compact list and a one-line trust note, centred in the
 *    space that's left so a short form (e.g. Google-only) doesn't leave a blank screen.
 *
 * The language switch is visible on every size: these screens have no other chrome, and a
 * family member who reads Hindi needs to switch before signing in.
 *
 * Photos live in client/public/assets/auth/ (credits and file sizes in CREDITS.md there): AVIF
 * with a WebP fallback, 4:5 crops at 1200/1920/2880 wide for the PC panel and 6:5 crops at
 * 800/1200 wide for the phone hero. Each `<picture>` only has sources for its own screen size
 * (media queries), so a phone never downloads the PC files and the reverse. Both load eagerly
 * with `fetchpriority="high"` over a tiny blurred copy.
 *
 * Props: title, subtitle?, children, footer?, photo? ('family' | 'paperwork', default
 * 'paperwork'), loading? (placeholder lines instead of the title/subtitle — while the session or
 * the page's data loads; pass skeleton blocks as `children`).
 */

/**
 * The two photos and a tiny blurred copy of each (shown while the real photo loads). `position`
 * keeps faces in view when `object-cover` trims the photo.
 */
const PHOTOS = {
  family: {
    name: 'family-portrait',
    position: 'object-[50%_30%]',
    placeholder: 'data:image/webp;base64,UklGRrwAAABXRUJQVlA4ILAAAABQBACdASoQABQAPrVInkmnJCKhMAgA4BaJagAjzMcmZBw2XWF+fDvY8NAQAP7yB1TJmjnMUSdPv2iKzDeavruPNW8J96SltkVP36PZ3tTxu75s1yce+6gscsSC+7tV4wi2dEvJRdy09yOcLX/z3G8FzZKPZ7W2hfmw3ETJg7nnkQCiev2z9Diu8X+wa3juVCnrDuZ8xBL0Aqlxd6JP8QMPWsCUUCvKkMm17EKK/5AAAA==',
    wide: 'family-portrait-wide',
    widePosition: 'object-[50%_35%]',
    widePlaceholder: 'data:image/webp;base64,UklGRggBAABXRUJQVlA4IPwAAACQBQCdASoYABQAPrVSo00nJKMiKAgA4BaJYgC2yYtUcLvd//bYzxB6X2b635n6b8WhwyksAAD+893Ou/SUKfghHrC9pWh49849Ng6yCK0LrrooI55bH11hS39B6wcf7D7sJtm7ki6SiS4XLVZqSty7uT5h+q1Rqv32C5+6Yiwjoh9/ke8acUoL8FR88kHobYsKqcra+UK3w/VqGVHEMQerZLr+cwsLEL4bhj/Y/wcbrKrBtE7/gV1le221gfUaI3tzzEKPq6G5/YQkQg2CCCMQBMCOoBotyjLtyCL1pxkeQihomUb7rCq3cyzo2Dr1Lntb89aqnBrh+NgAAAA=',
  },
  paperwork: {
    name: 'couple-paperwork',
    position: 'object-[50%_35%]',
    placeholder: 'data:image/webp;base64,UklGRtQAAABXRUJQVlA4IMgAAADQBACdASoQABQAPrVInkmnJCKhMAgA4BaJZACdMoR4KGVjlAoSPiOqmHugw2DZoAD+sNMs5C9PaOTGbJOyE7JNlbw7aztvyEc/TKV03Wblt148qRZZrMPAZmvEYvVceU7GWludfy7flUratpM3k02/en8wbhKk/hJj6SHkuXzc+FGleiKulEUAi2RFwBJk/sDv4n/wJ5+ZU49HuFWI/kl9edP+OBkXo77hIF57xNbrx+0Ii9T4g9myyxOh35mWtv3hJIACBAAAAA==',
    wide: 'couple-paperwork-wide',
    widePosition: 'object-[50%_40%]',
    widePlaceholder: 'data:image/webp;base64,UklGRiABAABXRUJQVlA4IBQBAADwBQCdASoYABQAPrVSok0nJKMiKAgA4BaJQBOnKAKx73VjeQ70xGtOZydOQ9rlROaSfryu09HXAAD+1FZBnjQLofBkaHrjww9wa3+mTl5OUlNU6Cvd8cza9+Su1vUm+GVJcwsWKkvSP//7o9LlPbjUrluYuJ4YGrVn8fPfzr96JzPyiCeUBwwUA5iSr5VK6BAAcrgt93GDE94S3X8HOJ0GaI66n38sSXVK/U2h1zPXEP+X7xd+AfUSRUScU/pNeI/lCtHmqe6rn7QLelWnt090oFu8d6P6YW7Nwib4NZXQGl4+dKFHuLr82JODZwN56S6OOUeCGmv3bxx2UsIXoESrW56zC4PpCCsWmqi0HRVwlEPYAAA=',
  },
};

const srcSet = (name, ext, widths) => widths.map((w) => `/assets/auth/${name}-${w}.${ext} ${w}w`).join(', ');
/** 1×1 transparent GIF — the `<img>` fallback, so a screen with no matching `<source>` fetches nothing. */
const EMPTY_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * A photo that fills its (positioned) parent, only on screens matching `media`: AVIF first,
 * WebP fallback, picked from `widths` by `sizes`.
 */
function AuthPhoto({ name, widths, media, sizes, width, height, position }) {
  return (
    <picture className="absolute inset-0">
      <source media={media} type="image/avif" srcSet={srcSet(name, 'avif', widths)} sizes={sizes} />
      <source media={media} type="image/webp" srcSet={srcSet(name, 'webp', widths)} sizes={sizes} />
      {/* Above the fold, so loaded straight away and first. */}
      <img
        src={EMPTY_IMG}
        width={width}
        height={height}
        alt=""
        fetchPriority="high"
        decoding="async"
        draggable={false}
        className={`absolute inset-0 h-full w-full select-none object-cover ${position}`}
      />
    </picture>
  );
}

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
      <span
        className={`text-base font-bold ${
          onPhoto ? 'text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]' : 'text-neutral-900 dark:text-neutral-100'
        }`}
      >
        Family Vault
      </span>
    </span>
  );
}

function useBenefits() {
  const { t } = useTranslation('auth');
  return [
    { icon: FileText, text: t('layout.benefitDocs', 'Aadhaar, PAN, passports — all in one safe place') },
    { icon: ShieldCheck, text: t('layout.benefitPrivate', 'Only your family can see them') },
    { icon: Link2, text: t('layout.benefitShare', 'Share with a link that expires on its own') },
  ];
}

/** PC only: the left half of the screen. */
function PhotoPanel({ photo }) {
  const { t } = useTranslation('auth');
  const benefits = useBenefits();
  return (
    <aside
      style={{ backgroundImage: `url(${photo.placeholder})` }}
      className="relative hidden overflow-hidden bg-primary-900 bg-cover bg-center lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col lg:justify-between lg:p-10 xl:p-12"
    >
      <AuthPhoto
        name={photo.name}
        widths={[1200, 1920, 2880]}
        media="(min-width: 1024px)"
        sizes="50vw"
        width={2880}
        height={3600}
        position={photo.position}
      />
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
        <p className="text-2xl font-bold leading-snug xl:text-3xl">
          {t('layout.tagline', "Your family's important papers, safe and always at hand")}
        </p>
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

/** Phones and tablets only: the photo across the top, with the logo and language switch on it. */
function PhoneHero({ photo }) {
  return (
    <div
      style={{ backgroundImage: `url(${photo.widePlaceholder})` }}
      className="relative h-[42svh] max-h-[26rem] min-h-52 overflow-hidden bg-primary-900 bg-cover bg-center [mask-image:linear-gradient(to_bottom,#000_58%,transparent)] lg:hidden"
    >
      <AuthPhoto
        name={photo.wide}
        widths={[800, 1200]}
        media="(max-width: 1023.98px)"
        sizes="100vw"
        width={1200}
        height={1000}
        position={photo.widePosition}
      />
      {/* A soft dark backdrop at the top so the logo and switch read; the bottom fades into the
          page through the mask above (no seam in either theme). */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-neutral-950/55 to-transparent" />
      <div className="relative flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <BrandMark onPhoto />
        <LanguageSwitcher />
      </div>
    </div>
  );
}

/** Phones and tablets only: the benefits and a trust note under the card. */
function PhoneBenefits() {
  const { t } = useTranslation('auth');
  const benefits = useBenefits();
  return (
    <div className="flex flex-1 flex-col justify-center pt-6 lg:hidden">
      <ul className="space-y-3">
        {benefits.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            <span className={`${ICON_TILE} ${KIND_TONE.folder}`}>
              <Icon className={ICON_TILE_ICON} aria-hidden="true" />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        {t('layout.trust', 'Encrypted and private to your family')}
      </p>
    </div>
  );
}

/** The form card: the standard card surface, a little rounder and lifted on phones where it overlaps the photo. */
const CARD =
  'rounded-2xl border border-neutral-200 bg-white shadow-soft-md lg:rounded-xl lg:shadow-card dark:border-neutral-700 dark:bg-neutral-800';

export default function AuthLayout({ title, subtitle, children, footer, photo = 'paperwork', loading = false }) {
  const p = PHOTOS[photo] || PHOTOS.paperwork;
  const heading = loading ? (
    <div className="flex flex-col items-center" aria-hidden="true">
      <Skeleton className="h-7 w-1/2 sm:h-8" />
      <Skeleton variant="line" height={14} width="70%" className="mt-2.5" />
    </div>
  ) : (
    <>
      <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl dark:text-neutral-100">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
    </>
  );
  return (
    <div className="min-h-[100dvh] bg-neutral-50 lg:grid lg:grid-cols-2 dark:bg-neutral-950">
      <PhotoPanel photo={p} />

      <main className="flex min-h-[100dvh] flex-col lg:px-10 lg:py-4">
        <PhoneHero photo={p} />
        <header className="hidden justify-end lg:flex">
          <LanguageSwitcher />
        </header>

        <div className="relative z-10 -mt-16 flex flex-1 flex-col px-4 pb-6 sm:px-6 lg:mt-0 lg:items-center lg:justify-center lg:px-0 lg:py-12">
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col lg:flex-none">
            {/* PC: the title sits above the card. Phones: inside it. */}
            <div className="mb-6 hidden text-center lg:block">{heading}</div>

            <div className={`${CARD} ${CARD_PADDING}`}>
              <div className="mb-5 text-center lg:hidden">{heading}</div>
              {children}
            </div>

            {footer && <div className="mt-5 text-center text-sm text-neutral-500 sm:mt-6 dark:text-neutral-400">{footer}</div>}

            <PhoneBenefits />
          </div>
        </div>
      </main>
    </div>
  );
}
