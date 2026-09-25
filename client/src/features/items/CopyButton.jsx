import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.jsx';
import { Check, Copy } from 'lucide-react';

/**
 * Copy icon button (the shared icon-button size): copies `value`, shows a "Copied" toast and
 * flips to a tick for a moment. `label` is its aria-label/tooltip ("Copy username").
 */
export default function CopyButton({ value, label }) {
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

  return (
    <Button type="button" variant="ghost" size="icon" onClick={copy} aria-label={label} title={label}>
      {copied ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </Button>
  );
}
