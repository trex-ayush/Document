import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
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
import { UsersIcon, MoreIcon } from '@/components/layout/icons.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { membersApi } from '@/services/membersApi.js';
import { familyApi } from '@/services/familyApi.js';
import { MemberFormModal, ResetPasswordModal } from '@/features/members/index.js';

function statusBadge(member, t) {
  if (member.status === 'invited') return <Badge tone="yellow">{t('common:status.invited', 'Invited')}</Badge>;
  if (member.status === 'disabled') return <Badge tone="red">{t('common:status.disabled', 'Disabled')}</Badge>;
  return <Badge tone="green">{t('common:status.active', 'Active')}</Badge>;
}

function roleBadge(member, t) {
  if (member.role === 'admin') return <Badge tone="purple">{t('common:status.admin', 'Admin')}</Badge>;
  if (!member.canLogin) return <Badge tone="gray">{t('badges.profileOnly', 'Profile only')}</Badge>;
  return <Badge tone="blue">{member.access === 'write' ? t('badges.write', 'Write') : t('badges.readOnly', 'Read only')}</Badge>;
}

function MemberActions({ member, isAdmin, onEdit, onResetPassword, onRemove, onResendInvite }) {
  const { t } = useTranslation(['members', 'common']);
  if (!isAdmin) return null;
  return (
    <Dropdown trigger={<Button variant="ghost" size="icon" aria-label={t('actionsMenu.ariaLabel', 'Member actions')}><MoreIcon className="w-5 h-5" /></Button>} align="right">
      <DropdownItem onSelect={() => onEdit(member)}>{t('common:actions.edit', 'Edit')}</DropdownItem>
      {member.status === 'invited' && <DropdownItem onSelect={() => onResendInvite(member)}>{t('actionsMenu.resendInvite', 'Resend invite')}</DropdownItem>}
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

/**
 * Members admin page (`/members`). Any authenticated member can view the
 * list (`GET /members` is "Auth required"); mutation actions (add/edit/
 * remove/reset password/resend invite) are admin-only and hidden entirely
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

  const handleResendInvite = async (member) => {
    try {
      await membersApi.resendInvite(member.id);
      toast.success(t('toasts.inviteResent', 'Invite resent to {{name}}', { name: member.name }));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('toasts.resendInviteFailed', 'Could not resend the invite.'));
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
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{m.relation || '—'}{m.user?.email ? ` · ${m.user.email}` : ''}</div>
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
        <MemberActions
          member={m}
          isAdmin={isAdmin}
          onEdit={handleEdit}
          onResetPassword={setResetTarget}
          onRemove={setRemoveTarget}
          onResendInvite={handleResendInvite}
        />
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
        <EmptyState icon={<UsersIcon className="w-16 h-16" />} title={t('page.emptyTitle', 'No members yet')} />
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
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{m.relation || '—'}</div>
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
                    onResendInvite={handleResendInvite}
                  />
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}

      <MemberFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        member={editingMember}
        emailEnabled={!!family?.emailEnabled}
        onSaved={invalidate}
      />

      <ResetPasswordModal isOpen={!!resetTarget} onClose={() => setResetTarget(null)} member={resetTarget} />

      <ConfirmModal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title={removeTarget ? t('removeModal.titleNamed', 'Remove {{name}}?', { name: removeTarget.name }) : t('removeModal.titleGeneric', 'Remove member?')}
        description={t('removeModal.description', "They'll immediately lose access to the vault. This can't be undone.")}
        confirmLabel={t('common:actions.remove', 'Remove')}
      />
    </div>
  );
}
