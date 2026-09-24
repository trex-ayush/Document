import { useTranslation } from 'react-i18next';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import { useTheme } from '@/context/ThemeContext.jsx';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.jsx';

/**
 * Settings > Theme tab. `ThemeContext` (`client/src/context/ThemeContext.jsx`)
 * only models `'light'|'dark'` — before any explicit choice it follows the
 * OS `prefers-color-scheme` live, so there's no separate "system" value to
 * set here; picking Light/Dark below is what makes the choice explicit
 * (persisted to localStorage) and stops it following the OS from then on.
 *
 * Also surfaces the app language picker (`LanguageSwitcher`, `variant="row"`
 * — its own docstring calls out exactly this "alongside the theme toggle"
 * placement) since this is the one "how the app looks/behaves for me" tab
 * in Settings and there's no other natural home for it.
 */
export default function SettingsTheme() {
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();

  const OPTIONS = [
    { value: 'light', label: t('theme.light', 'Light') },
    { value: 'dark', label: t('theme.dark', 'Dark') },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('theme.description', 'Choose how Family Vault looks on this device.')}</p>
          <div className="grid grid-cols-2 gap-2 max-w-xs">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className={`min-h-[44px] rounded-lg border px-3 text-sm font-medium transition-colors ${
                  theme === opt.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-400">
            {t('theme.followsSystem', "Follows your device's system setting automatically until you pick one above.")}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <LanguageSwitcher variant="row" />
        </CardBody>
      </Card>
    </div>
  );
}
