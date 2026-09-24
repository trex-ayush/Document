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
 *  - user       { name, avatar?, avatarColor? }
 *  - size?      'xs' | 'sm' | 'md' (default) | 'lg' | 'xl'
 *  - className? appended last (Rule 8)
 *
 * @example
 * <Avatar user={membership} size="md" />
 * <AvatarStack users={members} max={3} />
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

  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
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

export const AvatarStack = ({ users = [], max = 3, size = 'sm' }) => {
  const visible = users.slice(0, max);
  const overflow = Math.max(0, users.length - max);
  return (
    <div className="flex items-center -space-x-2">
      {visible.map((u) => (
        <div key={u.id || u._id} className="ring-2 ring-white dark:ring-neutral-800 rounded-full">
          <Avatar user={u} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div className="ring-2 ring-white dark:ring-neutral-800 rounded-full">
          <div className={`${SIZES[size]} rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 flex items-center justify-center font-medium`}>
            +{overflow}
          </div>
        </div>
      )}
    </div>
  );
};

export default Avatar;
