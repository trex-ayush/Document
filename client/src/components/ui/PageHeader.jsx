import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import Button from './Button.jsx';
import Tooltip from '@/components/ui/Tooltip.jsx';

/**
 * PageHeader — the one top-of-page heading (docs/UI_KIT.md "Design standard" → Page header).
 *
 *   [breadcrumb]                         (small, muted, above the title)
 *   [← back] Title [titleAddon]          [actions, right-aligned on sm+; below on phones]
 *   subtitle                              (muted)
 *
 * Title is `text-xl sm:text-2xl font-bold`; the gap below the header equals the section gap
 * (`mb-4 sm:mb-6`) on every page.
 *
 * Props:
 *  - title (string|node), subtitle? (string|node), breadcrumb? (node)
 *  - actions? (node) — buttons; they wrap on narrow screens
 *  - onBack? () => void — shows a back arrow before the title
 *  - titleAddon? (node) — sits right after the title (e.g. a folder's "…" menu)
 *  - className?
 *
 * @example
 * <PageHeader title="Bin" subtitle="Things you delete wait here." />
 * <PageHeader title="Upload document" onBack={goBack} subtitle={<SaveInRow />} />
 */
const PageHeader = ({ title, subtitle, breadcrumb, actions, onBack, titleAddon, className = '' }) => {
  const { t } = useTranslation('common');
  return (
    <div className={`mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="min-w-0 flex-1">
        {breadcrumb && <div className="mb-1 text-sm text-neutral-500 dark:text-neutral-400">{breadcrumb}</div>}
        <div className="flex min-w-0 items-center gap-1">
          {onBack && (
            <Tooltip content={t('tip.back', 'Go back')} className="-ml-3 inline-flex">
              <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('actions.back', 'Back')}>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
            </Tooltip>
          )}
          <h1 className="min-w-0 break-words text-xl font-bold text-neutral-900 dark:text-neutral-100 sm:text-2xl">{title}</h1>
          {titleAddon}
        </div>
        {subtitle && <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
};

export default PageHeader;
