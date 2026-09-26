import Badge from '@/components/ui/Badge.jsx';

/** Status badge for a member row / panel: Invite pending (amber) · Disabled (red) · Active (green). */
export function statusBadge(member, t) {
  if (member.status === 'invited') return <Badge tone="yellow">{t('members:badges.invitePending', 'Invite pending')}</Badge>;
  if (member.status === 'disabled') return <Badge tone="red">{t('common:status.disabled', 'Disabled')}</Badge>;
  return <Badge tone="green">{t('common:status.active', 'Active')}</Badge>;
}

/** Badge next to a member's name: Owner (gray) · Admin (purple, a family admin) · none. */
export function titleBadge(member, t) {
  if (member.isOwner) return <Badge tone="gray">{t('members:badges.owner', 'Owner')}</Badge>;
  if (member.role === 'admin') return <Badge tone="purple">{t('members:badges.admin', 'Admin')}</Badge>;
  return null;
}

/** Access badge for a non-admin: Profile only · View only / Can add & edit (admins: none — see titleBadge). */
export function roleBadge(member, t) {
  if (member.role === 'admin') return null;
  if (!member.canLogin) return <Badge tone="gray">{t('members:badges.profileOnly', 'Profile only')}</Badge>;
  return (
    <Badge tone="blue">
      {member.access === 'read' ? t('members:badges.readOnly', 'View only') : t('members:badges.write', 'Can add & edit')}
    </Badge>
  );
}

/** The user shape `Avatar` wants, from a Membership. */
export const avatarUser = (m) =>
  m?.user ? { name: m.name, avatarColor: m.user.avatarColor, avatarUrl: m.user.avatarUrl } : { name: m?.name };
