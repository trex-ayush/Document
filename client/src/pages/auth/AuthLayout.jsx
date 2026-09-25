import LanguageSwitcher from '@/components/layout/LanguageSwitcher.jsx';
import { CARD_PADDING, CARD_SURFACE } from '@/components/ui/tokens.js';

/**
 * AuthLayout — shared shell for Login/Signup/ForgotPassword/ResetPassword/
 * AcceptInvite (and reused as-is by `pages/Onboarding.jsx` for its own
 * centered-card screen): centered card on a soft background, brand mark,
 * title/subtitle, and a footer slot (the "Don't have an account? Sign up" /
 * "Already have an account? Sign in" switch link). Not a UI primitive
 * (single-use, auth-page-specific) — kept local to pages/auth/.
 *
 * Carries its own standalone `LanguageSwitcher`, top-right of the card —
 * every one of these screens is reachable with no session and no other
 * chrome (no Navbar/MobileDrawer exists yet at this point), so a family
 * member who's only comfortable in Hindi still needs to be able to switch
 * language before signing in at all. Same reasoning and the same corner
 * placement as `pages/PublicShare.jsx`'s standalone switcher, the other
 * screen with no logged-in chrome around it.
 *
 * Works at 360px (card fills the viewport with side gutters) up through
 * desktop (card caps at max-w-md, centered — the one width every signed-out auth screen uses).
 * The card is the standard card surface and padding; the title uses the page-title size.
 *
 * Props: title, subtitle?, children, footer?, heroImage? (decorative illustration URL shown
 * instead of the logo, e.g. `/assets/welcome-onboarding.png`).
 */
export default function AuthLayout({ title, subtitle, children, footer, heroImage }) {
  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4 py-10 sm:py-16">
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-4 flex flex-col items-center sm:mb-6">
          {heroImage ? (
            // Decorative welcome illustration (1536×1024) shown in place of the logo — e.g. Onboarding.
            <img
              src={heroImage}
              alt=""
              width={1536}
              height={1024}
              decoding="async"
              className="mb-4 h-auto w-full max-w-[220px] sm:max-w-[280px] select-none"
              draggable={false}
            />
          ) : (
            <img src="/assets/logo.png" alt="Family Vault" width={256} height={234} decoding="async" className="h-14 w-auto mb-4" />
          )}
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 text-center">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 text-center">{subtitle}</p>}
        </div>

        <div className={`${CARD_SURFACE} ${CARD_PADDING}`}>
          {children}
        </div>

        {footer && <div className="mt-4 text-center text-sm text-neutral-500 dark:text-neutral-400 sm:mt-6">{footer}</div>}
      </div>
    </div>
  );
}
