import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/services/authApi.js';
import Button from '@/components/ui/Button.jsx';
import PasswordInput from '@/components/ui/PasswordInput.jsx';
import { useSignInMethods } from '@/hooks/useSignInMethods.js';
import { Notice } from '@/components/ui/PageState.jsx';
import AuthLayout, { AUTH_LINK } from './AuthLayout.jsx';
import { SignInSkeleton, GoogleOnlyNotice } from './SignInPolicy.jsx';

/**
 * Password reset page. Public route (`/reset-password?token=...`) — see
 * this agent's final report for the exact route the lead should wire in
 * AppRouter.jsx. Reads `token` from the query string (the link a
 * password-reset email points to).
 */
export default function ResetPassword() {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const [expired, setExpired] = useState(false);
  const [formError, setFormError] = useState('');
  const { method, isResolving } = useSignInMethods();

  const resetPasswordSchema = z
    .object({
      newPassword: z
        .string()
        .min(8, t('validation.passwordMinLength', 'At least 8 characters'))
        .regex(/[a-zA-Z]/, t('validation.passwordLetter', 'Include at least one letter'))
        .regex(/[0-9]/, t('validation.passwordNumber', 'Include at least one number')),
      confirmPassword: z.string().min(1, t('validation.confirmPasswordRequired', 'Confirm your new password')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('validation.passwordsMismatch', "Passwords don't match"),
      path: ['confirmPassword'],
    });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async ({ newPassword }) => {
    setFormError('');
    try {
      await authApi.resetPassword({ token, newPassword });
      toast.success(t('resetPassword.success', 'Password updated — sign in with your new password.'));
      navigate('/login', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'INVALID_OR_EXPIRED_TOKEN') {
        setExpired(true);
      } else {
        setFormError(err?.response?.data?.message || t('resetPassword.failed', 'Could not reset your password. Please try again.'));
      }
    }
  };

  if (method === 'google') return <GoogleOnlyNotice />;

  if (!token || expired) {
    return (
      <AuthLayout
        title={t('resetPassword.linkExpiredTitle', 'Link expired')}
        subtitle={t('resetPassword.linkExpiredSubtitle', 'This password reset link is invalid or has expired')}
        footer={
          <Link to="/login" className={AUTH_LINK}>
            {t('resetPassword.backToSignIn', 'Back to sign in')}
          </Link>
        }
      >
        <Button as={Link} to="/forgot-password" block>
          {t('resetPassword.requestNewLink', 'Request a new link')}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('resetPassword.title', 'Set a new password')} subtitle={t('resetPassword.subtitle', 'Choose a new password for your account')}>
      {isResolving ? (
        <SignInSkeleton />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <PasswordInput
            label={t('resetPassword.newPasswordLabel', 'New password')}
            autoComplete="new-password"
            placeholder={t('resetPassword.newPasswordPlaceholder', 'At least 8 characters')}
            help={!errors.newPassword ? t('resetPassword.newPasswordHelp', 'At least 8 characters, with a letter and a number') : undefined}
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <PasswordInput
            label={t('resetPassword.confirmPasswordLabel', 'Confirm new password')}
            autoComplete="new-password"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" block loading={isSubmitting}>
            {t('resetPassword.submit', 'Reset password')}
          </Button>
        </form>
      )}
      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
        {t('resetPassword.signOutNotice', 'This will sign you out of every other device.')}
      </p>
    </AuthLayout>
  );
}
