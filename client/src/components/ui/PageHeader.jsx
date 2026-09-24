/**
 * PageHeader — standard top-of-page heading. Title + optional subtitle on
 * the left, an actions slot (buttons, toggles) on the right, an optional
 * breadcrumb above the title.
 *
 * Ported verbatim from apps/template/src/components/ui/PageHeader.jsx.
 *
 * Props: title (string|node), subtitle? (string|node), breadcrumb? (string|node), actions? (node), className?
 *
 * @example
 * <PageHeader title="Browse" subtitle="24 documents · 6 folders" actions={<Button>+ Upload</Button>} />
 */
const PageHeader = ({ title, subtitle, breadcrumb, actions, className = '' }) => (
  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-4 sm:mb-6 ${className}`}>
    <div className="min-w-0">
      {breadcrumb && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">{breadcrumb}</div>
      )}
      <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100">{title}</h1>
      {subtitle && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{subtitle}</p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{actions}</div>}
  </div>
);

export default PageHeader;
