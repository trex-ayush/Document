import LanguageSwitcher from '@/components/layout/LanguageSwitcher.jsx';

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
 * desktop (card caps at max-w-md, centered).
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4 py-10 sm:py-16">
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src="/assets/logo.png" alt="Family Vault" width={256} height={234} decoding="async" className="h-14 w-auto mb-4" />
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 text-center">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400 text-center">{subtitle}</p>}
        </div>

        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-card p-6 sm:p-8">
          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">{footer}</div>}
      </div>
    </div>
  );
}
