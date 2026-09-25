import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Input from '@/components/ui/Input.jsx';
import Button from '@/components/ui/Button.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { authApi } from '@/services/authApi.js';

/**
 * Settings > Password tab. Two modes based on `user.authProviders`
 * (docs/DECISIONS.md "Google sign-in"):
 *  - Has a password: normal change-password form (`POST /auth/change-password`).
 *  - Google-only, no password yet: "Set a password" form (`POST /auth/set-password`,
 *    allowed only while the account has no password).
 */
export default function SettingsPassword() {
  const { t } = useTranslation('settings');
  const { user, updateUser } = useAuth();
  const hasPassword = user?.authProviders?.includes('password');

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const validate = () => {
    if (next.length < 8) {
      setError(t('password.validation.minLength', 'New password must be at least 8 characters'));
      return false;
    }
    if (next !== confirm) {
      setError(t('password.validation.mismatch', "Passwords don't match"));
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
      toast.success(t('password.changed', 'Password changed'));
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err?.response?.data?.message || t('password.changeFailed', 'Could not change your password.'));
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
      await authApi.setPassword(next);
      updateUser({ ...user, authProviders: [...(user.authProviders || []).filter((p) => p !== 'password'), 'password'] });
      toast.success(t('password.setSuccess', 'Password set — you can now sign in with a password too.'));
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err?.response?.data?.message || t('password.setFailed', 'Could not set your password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardBody>
        {hasPassword ? (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <Input
              label={t('password.currentPasswordLabel', 'Current password')}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <Input
              label={t('password.newPasswordLabel', 'New password')}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              help={!error ? t('password.newPasswordHelp', 'At least 8 characters, with a letter and a number') : undefined}
            />
            <Input
              label={t('password.confirmNewPasswordLabel', 'Confirm new password')}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={error}
            />
            <div className="kb-sticky">
              <Button type="submit" loading={saving}>
                {t('password.changePassword', 'Change password')}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t('password.googleOnlyNotice', 'You currently sign in with Google only. Set a password so you can also sign in without it.')}
            </p>
            <Input
              label={t('password.newPasswordLabel', 'New password')}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              help={!error ? t('password.newPasswordHelp', 'At least 8 characters, with a letter and a number') : undefined}
            />
            <Input
              label={t('password.confirmPasswordLabel', 'Confirm password')}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={error}
            />
            <div className="kb-sticky">
              <Button type="submit" loading={saving}>
                {t('password.setPassword', 'Set a password')}
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
