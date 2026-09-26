import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n/index.js';
import { SEGMENT_TRACK, segmentItem } from '@/components/ui/tokens.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

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
 * AuthLayout, PublicShare) rather than through a shared
 * primitive registry.
 *
 * Props: `variant` — `'segmented'` (default; two-button pill showing both
 * language names at once, fits a navbar or dropdown with room to spare) |
 * `'compact'` (single button sized like the other
 * icon-row controls — shows the *other* language's own name, e.g. a button
 * reading "हिन्दी" while the app is in English — one tap switches straight
 * to it; for the tightest spot, the mobile navbar icon row, where a full
 * two-name pill doesn't fit). `block?` (segmented only: stretch to fill its container with
 * equal-width segments). `className?`
 *
 * @example
 * import LanguageSwitcher from '@/components/layout/LanguageSwitcher.jsx';
 * <LanguageSwitcher />
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
    const label = t('common:language.switchTo', 'Switch to {{language}}', { language: other.label });
    return (
      <Tooltip content={label} position="bottom">
        <button
          type="button"
          onClick={() => select(other.code)}
          aria-label={label}
          className={`inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700 ${className}`}
        >
          {other.label}
        </button>
      </Tooltip>
    );
  }

  return (
    <div
      className={`${block ? 'flex w-full' : 'inline-flex'} items-center ${SEGMENT_TRACK} ${className}`}
      role="group"
      aria-label={t('common:language.label', 'Language')}
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const label = t('common:language.switchTo', 'Switch to {{language}}', { language: lang.label });
        return (
          <Tooltip
            key={lang.code}
            // The active language needs no hint — it is already in use.
            content={current === lang.code ? null : label}
            className={block ? 'flex flex-1' : 'inline-flex'}
          >
            <button
              type="button"
              onClick={() => select(lang.code)}
              aria-pressed={current === lang.code}
              aria-label={label}
              className={`${block ? 'flex-1 min-h-9 text-sm' : 'min-h-8 text-xs'} px-2.5 ${segmentItem(current === lang.code)}`}
            >
              {lang.label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
