import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.jsx';
import { Check, Copy } from 'lucide-react';

/** Small "Copy" button that flips to "Copied" for a moment. */
export default function CopyButton({ value, label }) {
  const { t } = useTranslation(['items', 'common']);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value ?? ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('detail.copyFailed', 'Could not copy. Please try again.'));
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="flex-shrink-0"
      onClick={copy}
      aria-label={label}
      leftIcon={copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    >
      {copied ? t('common:actions.copied', 'Copied') : t('common:actions.copy', 'Copy')}
    </Button>
  );
}
