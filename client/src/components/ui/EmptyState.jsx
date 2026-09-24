/**
 * EmptyState — centered "nothing to show" panel. Replaces inline
 * `<div className="text-center py-12">` + SVG + heading + description + CTA
 * patterns (Rule 13 — empty/loading states ship as primitives).
 *
 * Ported verbatim from apps/template/src/components/ui/EmptyState.jsx.
 *
 * Props (all optional):
 *  - icon:        ReactNode, usually an `<svg>`
 *  - title:       string | ReactNode
 *  - description: string | ReactNode
 *  - action:      ReactNode, usually a `<Button>`
 *  - variant:     'card' (default, bordered surface) | 'inline' | 'plain'
 *  - size:        'sm' | 'md' (default) | 'lg' — vertical padding
 *  - className:   appended last (Rule 8)
 *  - children:    replaces the default title/description/action rendering entirely
 *
 * @example
 * <EmptyState
 *   icon={<FolderIcon className="w-16 h-16" />}
 *   title="No documents yet"
 *   description="Upload your first document to this folder."
 *   action={<Button onClick={openUpload}>Upload</Button>}
 * />
 */
const VARIANT = {
  card: 'bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-sm',
  inline: '',
  plain: '',
};

const SIZE_PAD = {
  sm: 'py-6',
  md: 'py-12',
  lg: 'py-20',
};

const EmptyState = ({
  icon,
  title,
  description,
  action,
  variant = 'card',
  size = 'md',
  className = '',
  children,
}) => {
  const containerCls = `${VARIANT[variant] ?? VARIANT.card} ${SIZE_PAD[size] ?? SIZE_PAD.md} px-4 text-center ${className}`;

  if (children) {
    return <div className={containerCls}>{children}</div>;
  }

  const titleNode = typeof title === 'string'
    ? <h3 className="text-lg font-medium text-gray-900 dark:text-neutral-100 mb-2">{title}</h3>
    : title;
  const descNode = typeof description === 'string'
    ? <p className="text-sm text-gray-500 dark:text-neutral-400 max-w-md mx-auto">{description}</p>
    : description;

  return (
    <div className={containerCls}>
      {icon && (
        <div className="mb-4 inline-flex items-center justify-center text-gray-400 dark:text-neutral-500">
          {icon}
        </div>
      )}
      {titleNode}
      {descNode}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
