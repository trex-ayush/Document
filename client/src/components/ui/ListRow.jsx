import { Link } from 'react-router-dom';
import { CARD_SURFACE, ICON_TILE, ICON_TILE_ICON, KIND_TONE, ROW_ACTIVE, ROW_HOVER } from './tokens.js';

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

/** Bordered card that holds rows, divided by a hairline. `overflowVisible` for rows with a dropdown menu. */
export function ListCard({ as: As = 'div', overflowVisible = false, className = '', children, ...rest }) {
  return (
    <As
      className={`divide-y divide-neutral-100 dark:divide-neutral-700 ${CARD_SURFACE} ${overflowVisible ? '' : 'overflow-hidden'} ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
}

/**
 * 32×32 row visual (the starter's icon tile, tokens.js ICON_TILE): a kind-tinted icon (`kind`:
 * folder | document | password | note | member) or an image thumbnail (`src`) of the same size.
 */
export function ListIcon({ icon: Icon, kind = 'document', src }) {
  if (src) {
    return (
      <span className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-700">
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className={`${ICON_TILE} ${KIND_TONE[kind] || KIND_TONE.document}`}>
      <Icon className={ICON_TILE_ICON} strokeWidth={2} aria-hidden="true" />
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
 * cutting it with "…"),
 * as? (root element, default 'div'; use 'li' inside a ListCard as="ul").
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
        <span className={`block text-sm font-medium text-neutral-900 dark:text-neutral-100 ${wrapTitle ? 'break-words' : 'truncate'}`}>{title}</span>
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
