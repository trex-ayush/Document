import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext.jsx';

const MODES = [
  { value: 'light', icon: Sun, labelKey: 'common:theme.light', fallback: 'Light mode' },
  { value: 'dark', icon: Moon, labelKey: 'common:theme.dark', fallback: 'Dark mode' },
];

/**
 * ThemeSwitcher — light/dark as a two-segment pill (a Sun and a Moon), styled exactly like
 * `LanguageSwitcher variant="segmented"` so the two sit side by side. The active mode is
 * highlighted; tapping a segment sets that mode (it is not a toggle). Icons only — each has
 * a translated aria-label and tooltip.
 *
 * Props: `className?`
 *
 * @example
 * <ThemeSwitcher />
 */
export default function ThemeSwitcher({ className = '' }) {
  const { t } = useTranslation('common');
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={`inline-flex items-center bg-gray-100 dark:bg-neutral-800 rounded-lg p-1 ${className}`}
      role="group"
      aria-label={t('theme.label', 'Theme')}
    >
      {MODES.map(({ value, icon: Icon, labelKey, fallback }) => {
        const label = t(labelKey, fallback);
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={`px-2.5 py-1 min-h-[32px] inline-flex items-center justify-center rounded-md transition-colors ${
              active
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
