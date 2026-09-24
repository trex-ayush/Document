import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal.jsx';
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
      setError('At least 8 characters');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await membersApi.resetPassword(member.id, password);
      toast.success(`Password reset for ${member.name}`);
      handleClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not reset the password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={member ? `Reset ${member.name}'s password` : 'Reset password'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Reset password
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="New temporary password"
          type="text"
          autoFocus
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          This immediately signs {member?.name || 'them'} out on every device.
        </p>
      </form>
    </Modal>
  );
}
