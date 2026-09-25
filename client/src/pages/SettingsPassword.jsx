import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { SectionCard } from '@/components/ui/Card.jsx';
import { FIELD_GAP } from '@/components/ui/tokens.js';
import PasswordInput from '@/components/ui/PasswordInput.jsx';
import Button from '@/components/ui/Button.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { authApi } from '@/services/authApi.js';

/**
 * Settings > My account > Password section. Two modes based on `user.authProviders`
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
    <SectionCard id="settings-password" title={t('tabs.password', 'Password')}>
      {hasPassword ? (
        <form onSubmit={handleChangePassword} className={FIELD_GAP}>
          <PasswordInput
            label={t('password.currentPasswordLabel', 'Current password')}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <PasswordInput
            label={t('password.newPasswordLabel', 'New password')}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            help={!error ? t('password.newPasswordHelp', 'At least 8 characters, with a letter and a number') : undefined}
          />
          <PasswordInput
            label={t('password.confirmNewPasswordLabel', 'Confirm new password')}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={error}
          />
          <div className="kb-sticky flex justify-end">
            <Button type="submit" loading={saving}>
              {t('password.changePassword', 'Change password')}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSetPassword} className={FIELD_GAP}>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t('password.googleOnlyNotice', 'You currently sign in with Google only. Set a password so you can also sign in without it.')}
          </p>
          <PasswordInput
            label={t('password.newPasswordLabel', 'New password')}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            help={!error ? t('password.newPasswordHelp', 'At least 8 characters, with a letter and a number') : undefined}
          />
          <PasswordInput
            label={t('password.confirmPasswordLabel', 'Confirm password')}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={error}
          />
          <div className="kb-sticky flex justify-end">
            <Button type="submit" loading={saving}>
              {t('password.setPassword', 'Set a password')}
            </Button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}
