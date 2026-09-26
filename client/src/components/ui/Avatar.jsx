/**
 * Avatar — circle with a photo or initials fallback. Family Vault members
 * carry `avatarColor` (a hex from signup/member creation, docs/API.md)
 * instead of a photo in v1, so the initials background uses that color when
 * present, falling back to the neutral gradient from the source primitive.
 *
 * Ported from apps/template/src/components/ui/Avatar.jsx. Change: the
 * initials tile reads `user.avatarColor` (our API's field) instead of always
 * using a fixed gradient.
 *
 * Props:
 *  - user       { name, avatarUrl?, avatar?, avatarColor? }
 *  - size?      'xs' | 'sm' | 'md' (default) | 'lg' | 'xl'
 *  - className? appended last (Rule 8)
 *
 * `avatarUrl` is the API's own field (set from a linked Google account's profile picture,
 * docs/API.md). `avatar` is kept as a fallback in case any caller's data uses that name instead.
 *
 * @example
 * <Avatar user={membership} size="md" />
 */
const SIZES = {
  xs: 'w-5 h-5 text-[8px]',
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-9 h-9 text-sm',
  lg: 'w-10 h-10 text-sm',
  xl: 'w-24 h-24 text-3xl',
};

const Avatar = ({ user, size = 'md', className = '' }) => {
  const sizeCls = SIZES[size] || SIZES.md;
  const name = user?.name || '';
  const initial = name.charAt(0).toUpperCase() || '?';

  const photoUrl = user?.avatarUrl || user?.avatar;
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${sizeCls} rounded-full object-cover ${className}`}
      />
    );
  }

  const style = user?.avatarColor ? { backgroundColor: user.avatarColor } : undefined;

  return (
    <div
      style={style}
      className={`${sizeCls} rounded-full ${style ? '' : 'bg-gradient-to-br from-neutral-600 to-neutral-800'} flex items-center justify-center text-white font-medium flex-shrink-0 ${className}`}
    >
      {initial}
    </div>
  );
};

export default Avatar;
