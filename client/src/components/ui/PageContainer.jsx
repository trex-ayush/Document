import { PAGE_PADDING, PAGE_WIDTH } from './tokens.js';

/**
 * PageContainer — the outer box of every signed-in page: the full width beside the sidebar (soft
 * cap 1600px), one gutter (`px-4 sm:px-6 lg:px-8`) and one top/bottom padding, so the left edge
 * of the content lines up on every page. Loading and error states render inside it too, so
 * nothing jumps when the data arrives.
 *
 * `size`:
 *  - 'full' (default) — lists, grids, dashboards: everything spans the width;
 *  - 'form' — forms and detail pages: the first child (the page header) spans the width, every
 *    child after it stays at a comfortable `max-w-3xl`, left-aligned, so a
 *    form never stretches across a wide screen.
 *
 * Props: children, size?, className? (extra layout only, e.g. `space-y-4`), as? (default 'div')
 *
 * @example
 * <PageContainer size="form">
 *   <PageHeader title="Save password" />
 *   <Card>…</Card>
 * </PageContainer>
 */
const FORM_CHILDREN = '[&>*:not(:first-child)]:max-w-3xl';

export default function PageContainer({ as: As = 'div', size = 'full', className = '', children, ...rest }) {
  return (
    <As className={`mx-auto w-full ${PAGE_WIDTH} ${PAGE_PADDING} ${size === 'form' ? FORM_CHILDREN : ''} ${className}`} {...rest}>
      {children}
    </As>
  );
}
