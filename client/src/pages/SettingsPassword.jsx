import { useState } from 'react';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Input from '@/components/ui/Input.jsx';
import Button from '@/components/ui/Button.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { authApi } from '@/services/authApi.js';
import { useReauth } from '@/features/share/index.js';

/**
 * Settings > Password tab. Two modes based on `user.authProviders`
 * (docs/DECISIONS.md "Google sign-in"):
 *  - Has a password: normal change-password form (`POST /auth/change-password`).
 *  - Google-only, no password yet: "Set a password" form, gated behind
 *    `useReauth()` (from `features/share/ReauthPrompt.jsx`) since
 *    `POST /auth/set-password` unconditionally requires the `X-Reauth`
 *    header (docs/API.md).
 */
export default function SettingsPassword() {
  const { user, updateUser } = useAuth();
  const hasPassword = user?.authProviders?.includes('password');
  const { requestReauth, reauthModal } = useReauth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const validate = () => {
    if (next.length < 8) {
      setError('New password must be at least 8 characters');
      return false;
    }
    if (next !== confirm) {
      setError("Passwords don't match");
      return false;
    }
    return true;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setSaving(true);
    try {
      await authApi.changePassword({ currentPassword: current, newPassword: next });
      toast.success('Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setSaving(true);
    try {
      const reauthToken = await requestReauth('Confirm your identity to set a password.');
      await authApi.setPassword(next, reauthToken);
      updateUser({ ...user, authProviders: [...(user.authProviders || []).filter((p) => p !== 'password'), 'password'] });
      toast.success('Password set — you can now sign in with a password too.');
      setNext('');
      setConfirm('');
    } catch (err) {
      if (err?.message === 'REAUTH_CANCELLED') {
        setSaving(false);
        return;
      }
      setError(err?.response?.data?.message || 'Could not set your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardBody>
        {hasPassword ? (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <Input label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              help={!error ? 'At least 8 characters, with a letter and a number' : undefined}
            />
            <Input label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={error} />
            <Button type="submit" loading={saving}>
              Change password
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              You currently sign in with Google only. Set a password so you can also sign in without it.
            </p>
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              help={!error ? 'At least 8 characters, with a letter and a number' : undefined}
            />
            <Input label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={error} />
            <Button type="submit" loading={saving}>
              Set a password
            </Button>
          </form>
        )}
      </CardBody>
      {reauthModal}
    </Card>
  );
}
