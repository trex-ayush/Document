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
 * Built as plain layout chrome, not a `components/ui` primitive — single
 * use (the navbar user menu + mobile drawer), like `AuthLayout`.
 *
 * Props: `variant` — `'segmented'` (default; two-button pill, fits a navbar
 * or dropdown) | `'row'` (full-width row with a label, fits a drawer/menu
 * list alongside the theme toggle). `className?`
 *
 * @example
 * import LanguageSwitcher from '@/components/layout/LanguageSwitcher.jsx';
 * <LanguageSwitcher />
 * <LanguageSwitcher variant="row" />
 */
export default function LanguageSwitcher({ variant = 'segmented', className = '' }) {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];

  const select = (code) => {
    if (code === current) return;
    i18n.changeLanguage(code);
  };

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
      className={`inline-flex items-center bg-gray-100 dark:bg-neutral-800 rounded-lg p-1 ${className}`}
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
          className={`px-2.5 py-1 min-h-[32px] text-xs font-medium rounded-md transition-colors ${
            current === lang.code
              ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
