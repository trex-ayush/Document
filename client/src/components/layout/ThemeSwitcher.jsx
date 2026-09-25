import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext.jsx';
import { SEGMENT_TRACK, segmentItem } from '@/components/ui/tokens.js';

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
 * Props: `block?` (stretch to fill its container, equal-width segments), `className?`
 *
 * @example
 * <ThemeSwitcher />
 */
export default function ThemeSwitcher({ block = false, className = '' }) {
  const { t } = useTranslation('common');
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={`${block ? 'flex w-full' : 'inline-flex'} items-center ${SEGMENT_TRACK} ${className}`}
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
            className={`${block ? 'flex-1 min-h-9' : 'min-h-8'} inline-flex items-center justify-center px-2.5 ${segmentItem(active)}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
