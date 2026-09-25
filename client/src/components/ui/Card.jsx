import { CARD_PADDING, SECTION_TITLE } from './tokens.js';

/**
 * Card — flexible bordered/shadowed surface used everywhere a container
 * needs chrome (document tiles, folder tiles, settings panels).
 *
 * Ported from apps/template/src/components/ui/Card.jsx. The defaults are the app's one card
 * look (docs/UI_KIT.md "Design standard"): rounded-xl, neutral border, `shadow-card`, and
 * `p-4 sm:p-5` inside a CardBody — pages shouldn't override them.
 *
 * Composition: <Card> + optional <CardHeader>, <CardBody>, <CardFooter>.
 *
 * Props (Card):
 *  - rounded?  'none' | 'sm' | 'md' | 'lg' | 'xl' (default) | '2xl'
 *  - shadow?   'none' | 'sm' | 'card' (default) | 'soft' | 'lg'
 *  - bordered? boolean — default true
 *  - hover?    boolean — subtle lift on hover, for clickable cards
 *  - as?       polymorphic element (Rule 9), default 'div'
 *  - className appended last (Rule 8)
 *
 * CardBody `padding?`: 'none' | 'md' (default, `p-4 sm:p-5`)
 *
 * @example
 * <Card hover onClick={() => navigate(`/documents/${doc.id}`)}>
 *   <CardBody>{doc.title}</CardBody>
 * </Card>
 */
const ROUNDED = {
  none: 'rounded-none',
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
};

const SHADOW = {
  none: '',
  sm: 'shadow-sm',
  card: 'shadow-card',
  soft: 'shadow-soft',
  lg: 'shadow-lg',
};

const PADDING = {
  none: 'p-0',
  md: CARD_PADDING,
};

export const Card = ({
  as: As = 'div',
  rounded = 'xl',
  shadow = 'card',
  bordered = true,
  hover = false,
  className = '',
  children,
  ...rest
}) => {
  const roundedCls = ROUNDED[rounded] ?? ROUNDED.xl;
  const shadowCls = SHADOW[shadow] ?? SHADOW.card;
  const borderCls = bordered ? 'border border-neutral-200 dark:border-neutral-700' : '';
  const hoverCls = hover ? 'hover-lift cursor-pointer' : '';
  return (
    <As
      className={`bg-white dark:bg-neutral-800 ${borderCls} ${roundedCls} ${shadowCls} ${hoverCls} ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
};

export const CardHeader = ({ className = '', children, ...rest }) => (
  <div className={`px-4 py-3 sm:px-5 border-b border-neutral-200 dark:border-neutral-700 ${className}`} {...rest}>
    {children}
  </div>
);

export const CardBody = ({ padding = 'md', className = '', children, ...rest }) => (
  <div className={`${PADDING[padding] ?? PADDING.md} ${className}`} {...rest}>
    {children}
  </div>
);

export const CardFooter = ({ className = '', children, ...rest }) => (
  <div className={`px-4 py-3 sm:px-5 border-t border-neutral-200 dark:border-neutral-700 ${className}`} {...rest}>
    {children}
  </div>
);

/**
 * SectionCard — a titled card for one section of a settings-style page: title (section title
 * style) and optional description in the header, then the body with the standard padding.
 * Props: title, description?, id? (for aria-labelledby), bodyClassName?, children
 */
export const SectionCard = ({ title, description, id, bodyClassName = '', children, className = '' }) => (
  <Card as="section" aria-labelledby={id} className={className}>
    <CardHeader>
      <h2 id={id} className={SECTION_TITLE}>{title}</h2>
      {description && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
    </CardHeader>
    <CardBody className={bodyClassName}>{children}</CardBody>
  </Card>
);

export default Card;
