import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';

/**
 * One-tap copy-to-clipboard button. Every custom field gets one (not just
 * sensitive ones) — the main use case is filling other forms with the
 * field's value.
 */
export default function CopyButton({ getValue, label, className = '' }) {
  const { t } = useTranslation('documents');
  const resolvedLabel = label ?? t('copyButton.label', 'Copy value');
  const [copied, setCopied] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    try {
      const value = typeof getValue === 'function' ? await getValue() : getValue;
      if (value === undefined || value === null || value === '') return;
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard permission denied or getValue() threw — silently no-op, the
      // button just doesn't flip to the "copied" state.
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={resolvedLabel}
      title={resolvedLabel}
      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200 ${className}`}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" strokeWidth={2.5} aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}
