import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Ellipsis, Users } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Table from '@/components/ui/Table.jsx';
import Badge from '@/components/ui/Badge.jsx';
import Avatar from '@/components/ui/Avatar.jsx';
import Button from '@/components/ui/Button.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmModal from '@/components/ui/ConfirmModal.jsx';
import { Dropdown, DropdownItem, DropdownDivider } from '@/components/ui/Dropdown.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { membersApi } from '@/services/membersApi.js';
import { familyApi } from '@/services/familyApi.js';
import { MemberFormModal, ResetPasswordModal, InviteShareModal } from '@/features/members/index.js';

function statusBadge(member, t) {
  if (member.status === 'invited') return <Badge tone="yellow">{t('badges.invitePending', 'Invite pending')}</Badge>;
  if (member.status === 'disabled') return <Badge tone="red">{t('common:status.disabled', 'Disabled')}</Badge>;
  return <Badge tone="green">{t('common:status.active', 'Active')}</Badge>;
}

function roleBadge(member, t) {
  if (member.role === 'admin') return <Badge tone="purple">{t('common:status.admin', 'Admin')}</Badge>;
  if (!member.canLogin) return <Badge tone="gray">{t('badges.profileOnly', 'Profile only')}</Badge>;
  return <Badge tone="blue">{member.access === 'read' ? t('badges.readOnly', 'View only') : t('badges.write', 'Can add & edit')}</Badge>;
}

function MemberActions({ member, isAdmin, onEdit, onResetPassword, onRemove, onShareInvite }) {
  const { t } = useTranslation(['members', 'common']);
  if (!isAdmin) return null;
  return (
    <Dropdown trigger={<Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" aria-label={t('actionsMenu.ariaLabel', 'Member actions')}><Ellipsis className="w-5 h-5" /></Button>} align="right">
      <DropdownItem onSelect={() => onEdit(member)}>{t('common:actions.edit', 'Edit')}</DropdownItem>
      {member.status === 'invited' && <DropdownItem onSelect={() => onShareInvite(member)}>{t('actionsMenu.shareInvite', 'Share invite link')}</DropdownItem>}
      {member.canLogin && member.status !== 'invited' && (
        <DropdownItem onSelect={() => onResetPassword(member)}>{t('actionsMenu.resetPassword', 'Reset password')}</DropdownItem>
      )}
      {!member.isOwner && (
        <>
          <DropdownDivider />
          <DropdownItem danger onSelect={() => onRemove(member)}>
            {t('common:actions.remove', 'Remove')}
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}

/** Big, visible "Share invite" button on a pending row — admins only. */
function ShareInviteButton({ member, isAdmin, loading, onShareInvite, className = '' }) {
  const { t } = useTranslation('members');
  if (!isAdmin || member.status !== 'invited') return null;
  return (
    <Button variant="secondary" size="sm" className={`whitespace-nowrap ${className}`} loading={loading} onClick={() => onShareInvite(member)}>
      {t('actionsMenu.shareInviteShort', 'Share invite')}
    </Button>
  );
}

/**
 * Members admin page (`/members`). Any authenticated member can view the
 * list (`GET /members` is "Auth required"); mutation actions (add/edit/
 * remove/reset password/share invite link) are admin-only and hidden entirely
 * for non-admins (server would 403 anyway — this just avoids showing dead
 * buttons).
 */
export default function Members() {
  const { t } = useTranslation(['members', 'common']);
  const { membership } = useAuth();
  const isAdmin = membership?.role === 'admin';
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null); // { member, invite }
  const [sharingId, setSharingId] = useState(null);

  const { data, isLoading, isError } = useQuery({ queryKey: ['members'], queryFn: () => membersApi.list() });
  const { data: family } = useQuery({ queryKey: ['family'], queryFn: () => familyApi.get() });

  const members = data?.items || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['members'] });

  const handleAdd = () => {
    setEditingMember(null);
    setFormOpen(true);
  };

  const handleEdit = (member) => {
    setEditingMember(member);
    setFormOpen(true);
  };

  // A fresh link is made every time (old links stop working), so it is also re-emailed — that way
  // the newest email and the link the admin shares are always the same, working link.
  const handleShareInvite = async (member) => {
    if (sharingId) return;
    setSharingId(member.id);
    try {
      const invite = await membersApi.inviteLink(member.id, { resend: true });
      if (invite.emailSent) {
        toast.success(t('invite.toastEmailSent', 'Invite sent to {{email}}', { email: member.user?.email || member.name }));
      } else {
        toast(t('invite.toastEmailNotSent', "We could not send an email — please share the link yourself."), { duration: 6000 });
      }
      setShareTarget({ member, invite });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('toasts.shareInviteFailed', 'Could not get the invite link. Please try again.'));
    } finally {
      setSharingId(null);
    }
  };

  const handleRemove = async () => {
    try {
      await membersApi.remove(removeTarget.id);
      toast.success(t('toasts.memberRemoved', '{{name}} removed', { name: removeTarget.name }));
      invalidate();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('toasts.removeFailed', 'Could not remove this member.'));
    }
  };

  const columns = [
    {
      key: 'name',
      label: t('table.member', 'Member'),
      render: (m) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar user={m.user ? { name: m.name, avatarColor: m.user.avatarColor, avatarUrl: m.user.avatarUrl } : { name: m.name }} size="md" />
          <div className="min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
              {m.name}
              {m.isOwner && <Badge tone="gray">{t('badges.owner', 'Owner')}</Badge>}
            </div>
            {m.user?.email && <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{m.user.email}</div>}
          </div>
        </div>
      ),
    },
    { key: 'role', label: t('table.access', 'Access'), render: (m) => roleBadge(m, t) },
    { key: 'status', label: t('table.status', 'Status'), render: (m) => statusBadge(m, t) },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (m) => (
        <div className="flex items-center justify-end gap-1">
          <ShareInviteButton member={m} isAdmin={isAdmin} loading={sharingId === m.id} onShareInvite={handleShareInvite} />
          <MemberActions
            member={m}
            isAdmin={isAdmin}
            onEdit={handleEdit}
            onResetPassword={setResetTarget}
            onRemove={setRemoveTarget}
            onShareInvite={handleShareInvite}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PageHeader
        title={t('page.title', 'Members')}
        subtitle={
          members.length === 1
            ? t('common:units.member_one', '{{count}} member', { count: members.length })
            : t('common:units.member_other', '{{count}} members', { count: members.length })
        }
        actions={isAdmin ? <Button onClick={handleAdd}>{t('page.addMember', '+ Add member')}</Button> : undefined}
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600 dark:text-red-400 text-center py-10">{t('page.loadError', 'Could not load members.')}</p>
      ) : members.length === 0 ? (
        <EmptyState icon={<Users className="w-16 h-16" />} title={t('page.emptyTitle', 'No members yet')} />
      ) : (
        <>
          <div className="hidden sm:block">
            <Card>
              <Table rows={members} rowKey={(m) => m.id} columns={columns} />
            </Card>
          </div>

          <div className="sm:hidden space-y-3">
            {members.map((m) => (
              <Card key={m.id}>
                <CardBody className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar user={m.user ? { name: m.name, avatarColor: m.user.avatarColor, avatarUrl: m.user.avatarUrl } : { name: m.name }} size="md" />
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                        {m.name}
                        {m.isOwner && <Badge tone="gray">{t('badges.owner', 'Owner')}</Badge>}
                      </div>
                      {m.user?.email && <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{m.user.email}</div>}
                      <div className="flex items-center gap-1.5 mt-1">
                        {roleBadge(m, t)}
                        {statusBadge(m, t)}
                      </div>
                    </div>
                  </div>
                  <MemberActions
                    member={m}
                    isAdmin={isAdmin}
                    onEdit={handleEdit}
                    onResetPassword={setResetTarget}
                    onRemove={setRemoveTarget}
                    onShareInvite={handleShareInvite}
                  />
                </CardBody>
                {isAdmin && m.status === 'invited' && (
                  <div className="px-5 pb-5 -mt-2">
                    <ShareInviteButton member={m} isAdmin={isAdmin} loading={sharingId === m.id} onShareInvite={handleShareInvite} className="w-full" />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <MemberFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        member={editingMember}
        familyName={family?.name}
        onSaved={invalidate}
      />

      <InviteShareModal
        isOpen={!!shareTarget}
        onClose={() => setShareTarget(null)}
        member={shareTarget?.member}
        familyName={family?.name}
        invite={shareTarget?.invite}
      />

      <ResetPasswordModal isOpen={!!resetTarget} onClose={() => setResetTarget(null)} member={resetTarget} />

      <ConfirmModal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title={removeTarget ? t('removeModal.titleNamed', 'Remove {{name}}?', { name: removeTarget.name }) : t('removeModal.titleGeneric', 'Remove member?')}
        description={t('removeModal.description', 'They will no longer be able to open the family vault. Everything they added stays here for the family.')}
        confirmLabel={t('common:actions.remove', 'Remove')}
      />
    </div>
  );
}
