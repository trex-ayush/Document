import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Mail, Plus } from 'lucide-react';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Badge from '@/components/ui/Badge.jsx';
import Avatar from '@/components/ui/Avatar.jsx';
import Button from '@/components/ui/Button.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import { ListCard, ListRow } from '@/components/ui/ListRow.jsx';
import { ErrorState } from '@/components/ui/PageState.jsx';
import { SkeletonRows } from '@/components/ui/Skeleton.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { membersApi } from '@/services/membersApi.js';
import { familyApi } from '@/services/familyApi.js';
import { AddMemberDrawer, MemberPanel, ResetPasswordModal } from '@/features/members/index.js';
import { avatarUser, roleBadge, statusBadge } from '@/features/members/memberBadges.jsx';

/**
 * Members page (`/members`). Any member can see the list (`GET /members`). Admins manage people:
 * tapping a row opens the member panel (edit name/access/status, share or re-send a pending
 * invite, reset password, remove) and a pending invite also gets a "Resend" button right on its
 * row. Non-admins see plain rows (the server would 403 the actions anyway).
 */
export default function Members() {
  const { t } = useTranslation(['members', 'common']);
  const { membership } = useAuth();
  const isAdmin = membership?.role === 'admin';
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [resendingId, setResendingId] = useState(null);

  const { data, isLoading, isError } = useQuery({ queryKey: ['members'], queryFn: () => membersApi.list() });
  const { data: family } = useQuery({ queryKey: ['family'], queryFn: () => familyApi.get() });

  const members = data?.items || [];
  const openMember = members.find((m) => m.id === openId) || null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['members'] });

  // Re-sends the invite email. Invite links are stored hashed, so this makes a fresh link (the
  // old one stops working) and emails it — the same call the member panel uses.
  const handleResend = async (member) => {
    if (resendingId) return;
    setResendingId(member.id);
    try {
      const invite = await membersApi.inviteLink(member.id, { resend: true });
      if (invite.emailSent) {
        toast.success(t('invite.toastEmailSent', 'Invite sent to {{email}}', { email: member.user?.email || member.invitedEmail || member.name }));
      } else {
        toast(t('invite.toastEmailNotSent', 'We could not send an email — please share the link yourself.'), { duration: 6000 });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('toasts.shareInviteFailed', 'Could not get the invite link. Please try again.'));
    } finally {
      setResendingId(null);
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

  // The panel hands over to these drawers; close it first so only one drawer is open.
  const startReset = (member) => {
    setOpenId(null);
    setResetTarget(member);
  };
  const startRemove = (member) => {
    setOpenId(null);
    setRemoveTarget(member);
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('page.title', 'Members')}
        subtitle={
          members.length === 1
            ? t('common:units.member_one', '{{count}} member', { count: members.length })
            : t('common:units.member_other', '{{count}} members', { count: members.length })
        }
        actions={
          isAdmin ? (
            <Button onClick={() => setAddOpen(true)} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
              {t('page.addMember', 'Add member')}
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <SkeletonRows count={5} avatar />
      ) : isError ? (
        <ErrorState>{t('page.loadError', 'Could not load members.')}</ErrorState>
      ) : members.length === 0 ? (
        <EmptyState image="/assets/empty-family-members.png" title={t('page.emptyTitle', 'No members yet')} />
      ) : (
        <ListCard columns>
          {members.map((m) => {
            const open = isAdmin ? () => setOpenId(m.id) : undefined;
            return (
              <ListRow
                key={m.id}
                onClick={open}
                mainProps={isAdmin ? { 'aria-label': t('rows.open', 'Open {{name}}', { name: m.name }) } : undefined}
                icon={<Avatar user={avatarUser(m)} size="md" />}
                title={
                  <span className="inline-flex max-w-full items-center gap-1.5">
                    <span className="truncate">{m.name}</span>
                    {m.isOwner && <Badge tone="gray">{t('badges.owner', 'Owner')}</Badge>}
                  </span>
                }
                meta={
                  <span className="flex flex-wrap items-center gap-1.5">
                    {(m.user?.email || m.invitedEmail) && <span className="min-w-0 truncate">{m.user?.email || m.invitedEmail}</span>}
                    {roleBadge(m, t)}
                    {statusBadge(m, t)}
                  </span>
                }
                actions={
                  isAdmin ? (
                    <>
                      {m.status === 'invited' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={resendingId === m.id}
                          disabled={Boolean(resendingId)}
                          onClick={() => handleResend(m)}
                          leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
                        >
                          {t('rows.resend', 'Resend')}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={open} aria-label={t('rows.open', 'Open {{name}}', { name: m.name })} tabIndex={-1}>
                        <ChevronRight className="h-5 w-5" aria-hidden="true" />
                      </Button>
                    </>
                  ) : null
                }
              />
            );
          })}
        </ListCard>
      )}

      <AddMemberDrawer isOpen={addOpen} onClose={() => setAddOpen(false)} familyName={family?.name} onSaved={invalidate} />

      <MemberPanel
        isOpen={Boolean(openMember)}
        member={openMember}
        onClose={() => setOpenId(null)}
        familyName={family?.name}
        onChanged={invalidate}
        onResetPassword={startReset}
        onRemove={startRemove}
      />

      <ResetPasswordModal isOpen={!!resetTarget} onClose={() => setResetTarget(null)} member={resetTarget} />

      <ConfirmDrawer
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title={removeTarget ? t('removeModal.titleNamed', 'Remove {{name}}?', { name: removeTarget.name }) : t('removeModal.titleGeneric', 'Remove member?')}
        description={t('removeModal.description', 'They will no longer be able to open the family vault. Everything they added stays here for the family.')}
        confirmLabel={t('common:actions.remove', 'Remove')}
      />
    </PageContainer>
  );
}
