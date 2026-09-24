/**
 * Card — flexible bordered/shadowed surface used everywhere a container
 * needs chrome (document tiles, folder tiles, settings panels).
 *
 * Ported verbatim from apps/template/src/components/ui/Card.jsx.
 *
 * Composition: <Card> + optional <CardHeader>, <CardBody>, <CardFooter>.
 *
 * Props (Card):
 *  - rounded?  'none' | 'sm' | 'md' | 'lg' (default) | 'xl' | '2xl'
 *  - shadow?   'none' | 'sm' | 'card' (default) | 'soft' | 'lg'
 *  - bordered? boolean — default true
 *  - hover?    boolean — subtle lift on hover, for clickable cards
 *  - as?       polymorphic element (Rule 9), default 'div'
 *  - className appended last (Rule 8)
 *
 * CardBody `padding?`: 'none' | 'sm' | 'md' (default) | 'lg'
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
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export const Card = ({
  as: As = 'div',
  rounded = 'lg',
  shadow = 'card',
  bordered = true,
  hover = false,
  className = '',
  children,
  ...rest
}) => {
  const roundedCls = ROUNDED[rounded] ?? ROUNDED.lg;
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
  <div className={`px-5 py-4 border-b border-neutral-200 dark:border-neutral-700 ${className}`} {...rest}>
    {children}
  </div>
);

export const CardBody = ({ padding = 'md', className = '', children, ...rest }) => (
  <div className={`${PADDING[padding] ?? PADDING.md} ${className}`} {...rest}>
    {children}
  </div>
);

export const CardFooter = ({ className = '', children, ...rest }) => (
  <div className={`px-5 py-3 border-t border-neutral-200 dark:border-neutral-700 ${className}`} {...rest}>
    {children}
  </div>
);

export default Card;
