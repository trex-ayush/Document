import { LogoMark } from '@/components/layout/icons.jsx';

/**
 * AuthLayout — shared shell for Login/Signup: centered card on a soft
 * background, brand mark, title/subtitle, and a footer slot (the
 * "Don't have an account? Sign up" / "Already have an account? Sign in"
 * switch link). Not a UI primitive (single-use, auth-page-specific) — kept
 * local to pages/auth/.
 *
 * Works at 360px (card fills the viewport with side gutters) up through
 * desktop (card caps at max-w-md, centered).
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-neutral-900 dark:bg-neutral-700 rounded-2xl flex items-center justify-center mb-4">
            <LogoMark className="w-6 h-6 text-white" />
          </div>
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
