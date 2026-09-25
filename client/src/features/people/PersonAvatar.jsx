import { UsersIcon } from '@/components/layout/icons.jsx';

// Soft, readable backgrounds for members who have no photo and no avatarColor of their own
// (profile-only members). Picked from the name so the same person always gets the same color.
const FALLBACK_COLORS = ['#F97362', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1'];

function colorFor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

const SIZES = {
  md: 'w-12 h-12 text-lg',
  lg: 'w-16 h-16 text-2xl',
};

/**
 * Big, friendly avatar for the member-first home tiles and the person page header.
 * `member` is a Membership from GET /members, or `null` for the "Shared (whole family)" tile.
 */
export default function PersonAvatar({ member, size = 'md', className = '' }) {
  const sizeCls = SIZES[size] || SIZES.md;

  if (!member) {
    return (
      <span className={`${sizeCls} flex flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 ${className}`}>
        <UsersIcon className={size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'} />
      </span>
    );
  }

  const photoUrl = member.user?.avatarUrl || member.avatarUrl;
  if (photoUrl) {
    return <img src={photoUrl} alt="" className={`${sizeCls} flex-shrink-0 rounded-full object-cover ${className}`} />;
  }

  const bg = member.user?.avatarColor || member.avatarColor || colorFor(member.name);
  return (
    <span
      style={{ backgroundColor: bg }}
      className={`${sizeCls} flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      aria-hidden="true"
    >
      {(member.name || '?').trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
