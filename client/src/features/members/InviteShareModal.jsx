import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import InviteSharePanel from './InviteSharePanel.jsx';

/**
 * InviteShareModal — the share step on its own, opened from a pending
 * member's "Share invite link" action on the Members page (after the admin
 * closed the add dialog before sending the link).
 *
 * Props: isOpen, onClose, member (Membership), familyName, invite { url, expiresAt, emailSent }.
 */
export default function InviteShareModal({ isOpen, onClose, member, familyName, invite }) {
  const { t } = useTranslation(['members', 'common']);
  return (
    <Modal
      isOpen={isOpen && !!invite}
      onClose={onClose}
      title={t('members:invite.title', 'Send the invite')}
      size="md"
      footer={
        <Button block onClick={onClose}>
          {t('common:actions.done', 'Done')}
        </Button>
      }
    >
      {invite && <InviteSharePanel name={member?.name} email={member?.user?.email} familyName={familyName} invite={invite} />}
    </Modal>
  );
}
