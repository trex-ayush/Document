import { useTranslation } from 'react-i18next';
import { LoaderCircle } from 'lucide-react';

/** Tiny, unobtrusive "Reading document…" line while the silent auto-fill scan runs. */
export default function ScanStatus({ scanning }) {
  const { t } = useTranslation('scan');
  if (!scanning) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500" aria-live="polite">
      <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
      {t('reading')}
    </p>
  );
}
