import { PAGE_PADDING, PAGE_WIDTH } from './tokens.js';

/**
 * PageContainer — the outer box of every signed-in page: the full width beside the sidebar (soft
 * cap 1600px), one gutter (`px-4 sm:px-6 lg:px-8`) and one top/bottom padding, so the left edge
 * of the content lines up on every page. Loading and error states render inside it too, so
 * nothing jumps when the data arrives.
 *
 * Pages use the whole width on large screens; forms and detail pages lay their content out in
 * columns there instead of stretching one narrow column across.
 *
 * Props: children, className? (extra layout only, e.g. `space-y-4`), as? (default 'div')
 *
 * @example
 * <PageContainer>
 *   <PageHeader title="Save password" />
 *   <Card>…</Card>
 * </PageContainer>
 */
export default function PageContainer({ as: As = 'div', className = '', children, ...rest }) {
  return (
    <As className={`mx-auto w-full ${PAGE_WIDTH} ${PAGE_PADDING} ${className}`} {...rest}>
      {children}
    </As>
  );
}
