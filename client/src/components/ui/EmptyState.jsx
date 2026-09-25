import { CARD_SURFACE } from './tokens.js';

/**
 * EmptyState — centered "nothing to show" panel. Replaces inline
 * `<div className="text-center py-12">` + SVG + heading + description + CTA
 * patterns (Rule 13 — empty/loading states ship as primitives).
 *
 * Ported from apps/template/src/components/ui/EmptyState.jsx, re-skinned to the design standard:
 * the card variant is the standard card surface, the title is a section title (`text-base
 * font-semibold`) and any `icon` is drawn at 48px in the muted colour whatever size it was given.
 *
 * Props (all optional):
 *  - icon:        ReactNode, usually a lucide-react icon
 *  - image:       string — URL of a decorative illustration (e.g. `/assets/empty-bin.png`).
 *                 Rendered above the title as a lazy <img alt="">, 180px wide on phones,
 *                 240px from `sm`. Shown instead of `icon` when both are passed.
 *  - imageWidth / imageHeight: intrinsic size of `image` (default 1536×1024, the size of
 *                 every illustration in client/public/assets) — reserves the space so the
 *                 layout doesn't jump when it loads
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
  card: CARD_SURFACE,
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
  image,
  imageWidth = 1536,
  imageHeight = 1024,
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
    ? <h3 className="mb-1 text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
    : title;
  const descNode = typeof description === 'string'
    ? <p className="mx-auto max-w-md text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
    : description;

  return (
    <div className={containerCls}>
      {image ? (
        <img
          src={image}
          alt=""
          width={imageWidth}
          height={imageHeight}
          loading="lazy"
          decoding="async"
          className="mx-auto mb-4 block h-auto w-full max-w-[180px] sm:max-w-[240px] select-none"
          draggable={false}
        />
      ) : icon && (
        <div className="mb-4 inline-flex items-center justify-center text-neutral-400 dark:text-neutral-500 [&>svg]:h-12 [&>svg]:w-12">
          {icon}
        </div>
      )}
      {titleNode}
      {descNode}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
};

export default EmptyState;
