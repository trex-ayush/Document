import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Drawer from '@/components/ui/Drawer.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import { membersApi } from '@/services/membersApi.js';

/**
 * ResetPasswordModal — admin sets a new temporary password for a
 * login-enabled member (`POST /members/:id/reset-password`). Revokes all of
 * that member's refresh tokens server-side (signs them out everywhere).
 * Props: isOpen, onClose, member.
 */
export default function ResetPasswordModal({ isOpen, onClose, member }) {
  const { t } = useTranslation(['members', 'common']);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(t('resetPasswordModal.minLengthError', 'At least 8 characters'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await membersApi.resetPassword(member.id, password);
      toast.success(t('resetPasswordModal.toastSuccess', 'Password reset for {{name}}', { name: member.name }));
      handleClose();
    } catch (err) {
      setError(err?.response?.data?.message || t('resetPasswordModal.toastFailed', 'Could not reset the password.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      title={member ? t('resetPasswordModal.titleNamed', "Reset {{name}}'s password", { name: member.name }) : t('resetPasswordModal.titleGeneric', 'Reset password')}
      side="right"
      size="sm"
      footer={
        <div className="flex w-full gap-2">
          <Button variant="ghost" className="flex-1" onClick={handleClose} disabled={submitting}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button className="flex-1" onClick={handleSubmit} loading={submitting}>
            {t('actionsMenu.resetPassword', 'Reset password')}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label={t('resetPasswordModal.newPasswordLabel', 'New temporary password')}
          type="text"
          autoFocus
          placeholder={t('resetPasswordModal.passwordPlaceholder', 'At least 8 characters')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {t('resetPasswordModal.signOutNotice', 'This immediately signs {{name}} out on every device.', { name: member?.name || t('resetPasswordModal.fallbackName', 'them') })}
        </p>
      </form>
    </Drawer>
  );
}
