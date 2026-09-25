import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n/index.js';

/**
 * LanguageSwitcher — standalone English/Hindi toggle. Self-contained: no
 * required props, drop in anywhere as `<LanguageSwitcher />`.
 *
 * Calling `i18n.changeLanguage()` re-renders every mounted component that
 * uses `useTranslation()` immediately (no page reload) and, because
 * `i18next-browser-languagedetector` is configured with
 * `caches: ['localStorage']` (client/src/i18n/index.js), the choice is
 * persisted under `LANGUAGE_STORAGE_KEY` automatically — it's restored on
 * the next visit ahead of the OS/browser-language default.
 *
 * Built as plain layout chrome, not a `components/ui` primitive — used
 * directly by the pages/components that need it (Navbar, MobileDrawer,
 * AuthLayout, SettingsTheme, PublicShare) rather than through a shared
 * primitive registry.
 *
 * Props: `variant` — `'segmented'` (default; two-button pill showing both
 * language names at once, fits a navbar or dropdown with room to spare) |
 * `'row'` (full-width row with a label, fits a drawer/menu list alongside
 * the theme toggle) | `'compact'` (single button sized like the other
 * icon-row controls — shows the *other* language's own name, e.g. a button
 * reading "हिन्दी" while the app is in English — one tap switches straight
 * to it; for the tightest spot, the mobile navbar icon row, where a full
 * two-name pill doesn't fit). `block?` (segmented only: stretch to fill its container with
 * equal-width segments). `className?`
 *
 * @example
 * import LanguageSwitcher from '@/components/layout/LanguageSwitcher.jsx';
 * <LanguageSwitcher />
 * <LanguageSwitcher variant="row" />
 * <LanguageSwitcher variant="compact" />
 */
export default function LanguageSwitcher({ variant = 'segmented', block = false, className = '' }) {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];

  const select = (code) => {
    if (code === current) return;
    i18n.changeLanguage(code);
  };

  if (variant === 'compact') {
    const other = SUPPORTED_LANGUAGES.find((lang) => lang.code !== current) || SUPPORTED_LANGUAGES[0];
    return (
      <button
        type="button"
        onClick={() => select(other.code)}
        aria-label={t('common:language.switchTo', 'Switch to {{language}}', { language: other.label })}
        className={`min-h-[44px] px-3 inline-flex items-center justify-center rounded-lg text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors ${className}`}
      >
        {other.label}
      </button>
    );
  }

  if (variant === 'row') {
    return (
      <div className={`flex items-center justify-between gap-3 ${className}`}>
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          {t('common:language.label', 'Language')}
        </span>
        <div className="inline-flex items-center bg-gray-100 dark:bg-neutral-800 rounded-lg p-1">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => select(lang.code)}
              aria-pressed={current === lang.code}
              aria-label={t('common:language.switchTo', 'Switch to {{language}}', { language: lang.label })}
              className={`px-3 py-1.5 min-h-[36px] text-sm font-medium rounded-md transition-colors ${
                current === lang.code
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${block ? 'flex w-full' : 'inline-flex'} items-center bg-gray-100 dark:bg-neutral-700/60 rounded-lg p-1 ${className}`}
      role="group"
      aria-label={t('common:language.label', 'Language')}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => select(lang.code)}
          aria-pressed={current === lang.code}
          aria-label={t('common:language.switchTo', 'Switch to {{language}}', { language: lang.label })}
          className={`${block ? 'flex-1 min-h-[36px] text-sm' : 'min-h-[32px] text-xs'} px-2.5 py-1 font-medium rounded-md transition-colors ${
            current === lang.code
              ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
