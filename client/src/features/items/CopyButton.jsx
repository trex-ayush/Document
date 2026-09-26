import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Copy } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip.jsx';

/** A soft round 40px icon button, for the actions inline in a field row. */
export const ROUND_ICON_BUTTON =
  'inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 active:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-primary-400 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 dark:active:bg-neutral-600';

/** The same button on a dark background (the full-screen file viewer). */
const ROUND_ICON_BUTTON_DARK =
  'inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white';

/**
 * Copy icon button (round, 40px): copies `value`, shows a "Copied" toast and flips to a tick for
 * a moment. `label` is its aria-label ("Copy username"); the hover tooltip says just "Copy" (or
 * `tip`). `tone="dark"` on a dark background.
 */
export default function CopyButton({ value, label, tip, tone = 'default' }) {
  const { t } = useTranslation(['items', 'common']);
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value ?? ''));
      toast.success(t('common:actions.copied', 'Copied'));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('detail.copyFailed', 'Could not copy. Please try again.'));
    }
  };

  const icon = copied ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />;
  return (
    <Tooltip content={tip || t('common:tip.copy', 'Copy it')}>
      <button type="button" onClick={copy} aria-label={label} className={tone === 'dark' ? ROUND_ICON_BUTTON_DARK : ROUND_ICON_BUTTON}>
        {icon}
      </button>
    </Tooltip>
  );
}
