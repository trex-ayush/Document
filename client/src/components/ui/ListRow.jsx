import { Link } from 'react-router-dom';
import { CARD_SURFACE, ITEM_ICON, KIND_ICON, ROW_ACTIVE, ROW_HOVER } from './tokens.js';
import Tooltip from './Tooltip.jsx';

/**
 * The one list-row style (docs/UI_KIT.md "Design standard" → Cards and lists), shared by Browse,
 * Search (page and navbar dropdown), Shares, Members, Bin, Activity and the + Add menu:
 *
 *   [icon 32×32]  Title (sm, medium)                         [trailing actions]
 *                 meta (xs, muted) · optional snippet
 *
 * Rows sit in a `ListCard` (one bordered card, rows divided by a hairline). Side padding matches
 * a card's (`px-4 sm:px-5`) so row text lines up with card text on the same page.
 */

/**
 * Rows two to a line from xl (1280px): hairlines between rows and between the two columns, a lone
 * last row spans both. Keeps long lists from stretching one short row across a wide screen.
 */
const LIST_COLUMNS = [
  'xl:grid xl:grid-cols-2',
  'xl:[&>*]:border-t-0 xl:[&>*]:border-b xl:[&>*]:border-neutral-100 dark:xl:[&>*]:border-neutral-700',
  'xl:[&>*:nth-child(odd)]:border-r',
  'xl:[&>*:last-child:nth-child(odd)]:col-span-2 xl:[&>*:last-child:nth-child(odd)]:border-r-0',
  'xl:[&>*:last-child]:border-b-0 xl:[&>*:nth-last-child(2):nth-child(odd)]:border-b-0',
].join(' ');

/**
 * Bordered card that holds rows, divided by a hairline. `overflowVisible` for rows with a dropdown
 * menu; `columns` puts the rows two to a line on wide screens (LIST_COLUMNS).
 */
export function ListCard({ as: As = 'div', overflowVisible = false, columns = false, className = '', children, ...rest }) {
  return (
    <As
      className={`divide-y divide-neutral-100 dark:divide-neutral-700 ${CARD_SURFACE} ${overflowVisible ? '' : 'overflow-hidden'} ${columns ? LIST_COLUMNS : ''} ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

/**
 * The row visual, in a 32×32 slot: an item icon with no background square, in its kind colour
 * with a soft fill (tokens.js KIND_ICON — `kind`: folder | document | pdf | password | note |
 * member), or an image thumbnail (`src`) with rounded corners.
 */
export function ListIcon({ icon: Icon, kind = 'document', src }) {
  if (src) {
    return (
      <span className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-md bg-neutral-100 ring-1 ring-black/5 dark:bg-neutral-700 dark:ring-white/10">
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
      <Icon className={`${ITEM_ICON} ${KIND_ICON[kind] || KIND_ICON.document}`} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/**
 * One row. The main area is a Link (`to`), a button (`onClick`) or plain content; `actions`
 * sit outside it on the right so buttons are never nested inside the link.
 *
 * Props: icon (node — usually <ListIcon/> or <Avatar/>), title, meta?, snippet?, actions?,
 * to? | onClick?, mainProps? (extra props for the main element — role, id, aria-*),
 * active? (highlighted, e.g. keyboard focus in the navbar search), compact? (tighter rows for a
 * popover/dropdown), wrapTitle? / wrapMeta? (let a long title or meta line wrap instead of
 * cutting it with "…"; a cut title shows whole in a tooltip on hover — `titleTip` sets that text
 * when `title` isn't a plain string),
 * tip? (a short "what happens when you open it" tooltip on the main area — buttons in `actions`
 * keep their own), as? (root element, default 'div'; use 'li' inside a ListCard as="ul").
 */
export function ListRow({
  as: As = 'div',
  icon,
  title,
  meta,
  snippet,
  actions,
  to,
  onClick,
  mainProps,
  active = false,
  compact = false,
  wrapTitle = false,
  wrapMeta = false,
  titleTip,
  tip,
  className = '',
}) {
  const interactive = Boolean(to || onClick);
  const pad = compact
    ? `py-2 pl-3 ${actions ? 'pr-2' : 'pr-3'}`
    : `py-3 pl-4 sm:pl-5 ${actions ? 'pr-2' : 'pr-4 sm:pr-5'}`;
  const mainCls = `flex min-w-0 flex-1 items-center gap-3 self-stretch text-left ${pad} ${
    interactive ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400' : ''
  }`;

  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        {wrapTitle ? (
          <span className="block break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</span>
        ) : (
          <Tooltip content={titleTip ?? (typeof title === 'string' ? title : null)} onlyWhenOverflow className="flex min-w-0">
            <span className="block min-w-0 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</span>
          </Tooltip>
        )}
        {meta && <span className={`mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400 ${wrapMeta ? '' : 'truncate'}`}>{meta}</span>}
        {snippet && <span className="mt-0.5 block text-xs text-neutral-600 line-clamp-2 dark:text-neutral-300">{snippet}</span>}
      </span>
    </>
  );

  let main;
  if (to) {
    main = <Link to={to} onClick={onClick} className={mainCls} {...mainProps}>{body}</Link>;
  } else if (onClick) {
    main = <button type="button" onClick={onClick} className={mainCls} {...mainProps}>{body}</button>;
  } else {
    main = <div className={mainCls} {...mainProps}>{body}</div>;
  }

  if (tip) {
    main = (
      <Tooltip content={tip} className="flex min-w-0 flex-1 self-stretch">
        {main}
      </Tooltip>
    );
  }

  return (
    <As
      className={`flex items-center transition-colors ${compact ? 'rounded-lg' : 'min-h-16 first:rounded-t-xl last:rounded-b-xl'} ${
        active ? ROW_ACTIVE : interactive ? ROW_HOVER : ''
      } ${className}`}
    >
      {main}
      {actions && <div className={`flex flex-shrink-0 items-center gap-2 ${compact ? 'pr-3' : 'pr-4 sm:pr-5'}`}>{actions}</div>}
    </As>
  );
}
