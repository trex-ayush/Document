import { PAGE_PADDING, PAGE_WIDTH } from './tokens.js';

/**
 * PageContainer — the outer box of every signed-in page. One max width (`max-w-5xl`), one
 * gutter (`px-4 sm:px-6`) and one top/bottom padding, so the left and right edges of the
 * content line up on every page — Home, Folders, a form or Settings. Loading and error
 * states render inside it too, so nothing jumps when the data arrives.
 *
 * Props: children, className? (extra layout only, e.g. `space-y-4`), as? (default 'div')
 *
 * @example
 * <PageContainer>
 *   <PageHeader title="Bin" />
 *   ...
 * </PageContainer>
 */
export default function PageContainer({ as: As = 'div', className = '', children, ...rest }) {
  return (
    <As className={`mx-auto w-full ${PAGE_WIDTH} ${PAGE_PADDING} ${className}`} {...rest}>
      {children}
    </As>
  );
}
