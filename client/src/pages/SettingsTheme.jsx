import Card, { CardBody } from '@/components/ui/Card.jsx';
import { useTheme } from '@/context/ThemeContext.jsx';

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Settings > Theme tab. `ThemeContext` (`client/src/context/ThemeContext.jsx`)
 * only models `'light'|'dark'` — before any explicit choice it follows the
 * OS `prefers-color-scheme` live, so there's no separate "system" value to
 * set here; picking Light/Dark below is what makes the choice explicit
 * (persisted to localStorage) and stops it following the OS from then on.
 */
export default function SettingsTheme() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardBody className="space-y-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Choose how Family Vault looks on this device.</p>
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
          Follows your device&apos;s system setting automatically until you pick one above.
        </p>
      </CardBody>
    </Card>
  );
}
