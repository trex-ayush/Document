import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { KeyRound, Mail, Share2, UserMinus } from 'lucide-react';
import Drawer from '@/components/ui/Drawer.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Avatar from '@/components/ui/Avatar.jsx';
import ChoiceGroup from '@/components/ui/ChoiceGroup.jsx';
import { FIELD_GAP, FIELD_HINT, SECTION_TITLE } from '@/components/ui/tokens.js';
import { membersApi } from '@/services/membersApi.js';
import InviteSharePanel from './InviteSharePanel.jsx';
import { avatarUser, roleBadge, statusBadge, titleBadge } from './memberBadges.jsx';
import { LEVEL_PAYLOAD, levelOf, levelOptions } from './accessLevels.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

/**
 * MemberPanel — one right-side drawer to manage a member (admins only; the Members page opens it
 * from a row):
 *  - header: avatar, name, email, Owner or Admin / access / status badges;
 *  - Details: name, access (choice cards, when they can sign in: view only · add, edit and share ·
 *    also invite and manage members = family admin; the owner's card just says "Owner") and
 *    status (not for a pending invite) — saved with the footer's Save (`PATCH /members/:id`
 *    `{ name, role, access, status }`);
 *  - Invite (pending only): "Share link" and "Send email again". Invite links are stored hashed,
 *    so the current one can't be shown again: both make a fresh link and email it
 *    (`POST /members/:id/invite-link { resend: true }`) — older links stop working, as the helper
 *    text says. "Share link" then shows the link with Copy / WhatsApp / Share;
 *  - Account: Reset password (when they sign in with one) and Remove from family (not the owner).
 *    Both hand over to the page's own drawers (`onResetPassword`, `onRemove`).
 *
 * Props: member, isOpen, onClose, familyName, onChanged() (refetch the list),
 * onResetPassword(member), onRemove(member), initialInvite? (a fresh invite link to show straight
 * away — the page's Resend when the email didn't go out), isSelf? (the signed-in admin's own row:
 * changing their own role reloads the app so its menus match).
 */
export default function MemberPanel({
  member,
  isOpen,
  onClose,
  familyName,
  onChanged,
  onResetPassword,
  onRemove,
  initialInvite = null,
  isSelf = false,
}) {
  const { t } = useTranslation(['members', 'common']);
  const [name, setName] = useState('');
  const [level, setLevel] = useState('write');
  const [status, setStatus] = useState('active');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(null); // 'share' | 'email' | null

  const memberId = member?.id;
  useEffect(() => {
    if (!isOpen || !member) return;
    setName(member.name || '');
    setLevel(levelOf(member));
    setStatus(member.status === 'disabled' ? 'disabled' : 'active');
    setNameError('');
    setInvite(initialInvite);
    setInviteBusy(null);
    // Only when a different member is opened — not when the list refetches behind the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, memberId]);

  if (!member) return null;
  const isPending = member.status === 'invited';
  const email = member.user?.email || member.invitedEmail || '';

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError(t('form.nameRequired', 'Name is required'));
      return;
    }
    const payload = { name: name.trim() };
    if (!isPending) payload.status = status;
    if (member.canLogin && !member.isOwner) Object.assign(payload, LEVEL_PAYLOAD[level]);
    const roleChanged = Boolean(payload.role) && payload.role !== member.role;
    setSaving(true);
    try {
      await membersApi.update(member.id, payload);
      toast.success(t('form.toastUpdated', 'Member updated'));
      // Your own admin role changed: reload so the menus and pages match what you can now do.
      if (isSelf && roleChanged) {
        window.location.reload();
        return;
      }
      onChanged?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('form.toastFailed', 'Could not save this member.'));
    } finally {
      setSaving(false);
    }
  };

  // A fresh link is made every time (old links stop working), and it is always emailed too, so
  // the newest email and the link the admin shares are the same working link.
  const freshInvite = async (kind) => {
    if (inviteBusy) return;
    setInviteBusy(kind);
    try {
      const next = await membersApi.inviteLink(member.id, { resend: true });
      // Showing the link: always after "Share link"; after "Send email again" if it was already
      // on screen or the email didn't go out (either way the old link no longer works, so the
      // admin needs the new one). The link panel says whether the email went out.
      const showPanel = kind === 'share' || Boolean(invite) || !next.emailSent;
      if (!showPanel) {
        toast.success(t('invite.toastEmailSent', 'Invite sent to {{email}}', { email: email || member.name }));
      } else if (kind === 'email' && !next.emailSent && !invite) {
        toast(t('invite.toastEmailNotSent', 'We could not send an email — the link is shown below for you to share.'), { duration: 6000 });
      }
      if (showPanel) setInvite(next);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('toasts.shareInviteFailed', 'Could not get the invite link. Please try again.'));
    } finally {
      setInviteBusy(null);
    }
  };

  const accessOptions = member.isOwner
    ? [{ value: 'owner', label: t('badges.owner', 'Owner'), hint: t('form.ownerHint', 'Owns this family and can do everything. This can’t be changed.') }]
    : levelOptions(t);
  const statusOptions = [
    { value: 'active', label: t('common:status.active', 'Active'), tip: t('tip.statusActive', 'They can sign in') },
    { value: 'disabled', label: t('common:status.disabled', 'Disabled'), tip: t('tip.statusDisabled', 'They cannot sign in for now') },
  ];
  const canResetPassword = member.canLogin && !isPending;
  const canRemove = !member.isOwner;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      side="right"
      size="sm"
      title={t('panel.title', 'Member')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t('form.saveChanges', 'Save changes')}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Avatar user={avatarUser(member)} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-semibold text-neutral-900 dark:text-neutral-100">{member.name}</p>
            {email && <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{email}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {titleBadge(member, t)}
              {roleBadge(member, t)}
              {statusBadge(member, t)}
            </div>
          </div>
        </div>

        <section aria-labelledby="member-details" className={FIELD_GAP}>
          <h3 id="member-details" className={SECTION_TITLE}>{t('panel.detailsTitle', 'Details')}</h3>
          <Input
            label={t('form.nameLabel', 'Name')}
            value={name}
            maxLength={150}
            error={nameError}
            onChange={(e) => {
              setNameError('');
              setName(e.target.value);
            }}
          />
          {member.canLogin && (
            <ChoiceGroup
              name="member-access"
              label={t('form.accessLevelLabel', 'Access level')}
              value={member.isOwner ? 'owner' : level}
              onChange={setLevel}
              disabled={member.isOwner}
              options={accessOptions}
            />
          )}
          {!isPending && (
            <ChoiceGroup
              name="member-status"
              label={t('form.statusLabel', 'Status')}
              value={status}
              onChange={setStatus}
              columns={2}
              options={statusOptions}
            />
          )}
        </section>

        {isPending && (
          <section aria-labelledby="member-invite" className="space-y-4 border-t border-neutral-200 pt-6 dark:border-neutral-700">
            <h3 id="member-invite" className={SECTION_TITLE}>{t('panel.inviteTitle', 'Invite')}</h3>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              {t('panel.inviteIntro', "{{name}} hasn't joined yet. Share the invite link or send the email again.", { name: member.name })}
            </p>
            {invite ? (
              <InviteSharePanel name={member.name} email={email} familyName={familyName} invite={invite} />
            ) : (
              <div>
                <Tooltip content={t('tip.newInviteLink', 'Make a new invite link')} className="grid">
                <Button
                  variant="secondary"
                  block
                  loading={inviteBusy === 'share'}
                  disabled={Boolean(inviteBusy)}
                  onClick={() => freshInvite('share')}
                  leftIcon={<Share2 className="h-4 w-4" aria-hidden="true" />}
                >
                  {t('panel.shareLink', 'Share link')}
                </Button>
                </Tooltip>
                <p className={FIELD_HINT}>{t('panel.shareLinkHint', 'Makes a fresh link and emails it too. Older links stop working.')}</p>
              </div>
            )}
            <div>
              <Tooltip content={t('tip.resend', 'Send the invite again')} className="grid">
              <Button
                variant="secondary"
                block
                loading={inviteBusy === 'email'}
                disabled={Boolean(inviteBusy)}
                onClick={() => freshInvite('email')}
                leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
              >
                {t('panel.resendEmail', 'Send email again')}
              </Button>
              </Tooltip>
              <p className={FIELD_HINT}>{t('panel.resendHint', 'Sends a fresh link by email. Older links stop working.')}</p>
            </div>
          </section>
        )}

        {(canResetPassword || canRemove) && (
          <section aria-labelledby="member-account" className="space-y-2 border-t border-neutral-200 pt-6 dark:border-neutral-700">
            <h3 id="member-account" className={`mb-2 ${SECTION_TITLE}`}>{t('panel.accountTitle', 'Account')}</h3>
            {canResetPassword && (
              <Tooltip content={t('tip.resetPassword', 'Set a new password for them')} className="grid">
                <Button variant="secondary" block onClick={() => onResetPassword(member)} leftIcon={<KeyRound className="h-4 w-4" aria-hidden="true" />}>
                  {t('actionsMenu.resetPassword', 'Reset password')}
                </Button>
              </Tooltip>
            )}
            {canRemove && (
              <Tooltip content={t('tip.removeMember', 'Take them out of this family')} className="grid">
                <Button variant="danger-ghost" block onClick={() => onRemove(member)} leftIcon={<UserMinus className="h-4 w-4" aria-hidden="true" />}>
                  {t('panel.removeFromFamily', 'Remove from family')}
                </Button>
              </Tooltip>
            )}
          </section>
        )}
      </div>
    </Drawer>
  );
}
