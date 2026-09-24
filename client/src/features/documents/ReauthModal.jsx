import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';

/**
 * Small inline password-prompt modal for `POST /auth/reauth` (docs/API.md).
 * No reauth-prompt primitive exists yet in the UI kit or `AuthContext`
 * (checked docs/UI_KIT.md §1/§8 and the source of both — Google sign-in's
 * reauth option is explicitly noted there as deferred to Phase 2/Agent F,
 * and nothing else calls `/auth/reauth`), so this agent built its own,
 * scoped to `features/documents/**` (see `useReauth.js`). Password-only —
 * the Google-credential reauth path is out of scope here for the same
 * reason it's out of scope for Agent D (docs/UI_KIT.md §8.4 "Phase 2").
 *
 * Purely presentational/controlled: `onSubmit(password)` may reject (wrong
 * password) and the modal just re-shows the error, it does not close itself.
 */
export default function ReauthModal({ isOpen, onCancel, onSubmit }) {
  const { t } = useTranslation(['documents', 'common']);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(password);
      setPassword('');
    } catch (err) {
      setError(err?.response?.data?.message || t('reauth.incorrectPassword', 'Incorrect password'));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setError('');
    onCancel();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title={t('reauth.title', "Confirm it's you")}
      description={t('reauth.description', 'Re-enter your password to reveal this sensitive value.')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleCancel} disabled={busy}>{t('common:actions.cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit} loading={busy} disabled={!password}>{t('common:actions.confirm', 'Confirm')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <Input
          type="password"
          label={t('reauth.passwordLabel', 'Password')}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
      </form>
    </Modal>
  );
}
