import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/services/authApi.js';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import { useSignInMethods } from '@/hooks/useSignInMethods.js';
import { Notice } from '@/components/ui/PageState.jsx';
import AuthLayout, { AUTH_LINK } from './AuthLayout.jsx';
import { SignInSkeleton, GoogleOnlyNotice } from './SignInPolicy.jsx';

/**
 * Forgot-password request page. Public route (`/forgot-password`) — see
 * this agent's final report for the exact route the lead should wire in
 * AppRouter.jsx.
 *
 * `POST /auth/forgot-password` always responds the same way (200, a generic
 * message) whether or not the account exists — by design, so this page
 * shows the same "check your email" state unconditionally. It never tells
 * the visitor whether that email is actually registered.
 */
export default function ForgotPassword() {
  const { t } = useTranslation('auth');
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState('');
  const { method, isResolving } = useSignInMethods();

  const forgotPasswordSchema = z.object({
    email: z.string().min(1, t('validation.emailRequired', 'Email is required')).email(t('validation.emailInvalid', 'Enter a valid email address')),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async ({ email }) => {
    setFormError('');
    try {
      await authApi.forgotPassword(email);
    } catch (err) {
      // A rate-limit (or network) error is the one case worth surfacing — everything else stays
      // silent so the page never hints at whether the account exists.
      if (err?.response?.status === 429) {
        setFormError(err?.response?.data?.message || t('forgotPassword.tooManyRequests', 'Too many requests — please try again later.'));
        return;
      }
    }
    setSent(true);
  };

  if (method === 'google') return <GoogleOnlyNotice />;

  if (sent) {
    return (
      <AuthLayout
        title={t('forgotPassword.checkEmailTitle', 'Check your email')}
        subtitle={t('forgotPassword.checkEmailSubtitle', "If an account with that email exists, we've sent a password reset link")}
        footer={
          <Link to="/login" className={AUTH_LINK}>
            {t('forgotPassword.backToSignIn', 'Back to sign in')}
          </Link>
        }
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t('forgotPassword.expiryNotice', "The link expires in 30 minutes. Didn't get it? Check your spam folder, or try again below.")}
        </p>
        <Button variant="secondary" block className="mt-4" onClick={() => setSent(false)}>
          {t('forgotPassword.tryDifferentEmail', 'Try a different email')}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('forgotPassword.title', 'Forgot your password?')}
      subtitle={t('forgotPassword.subtitle', "Enter your email and we'll send you a reset link")}
      footer={
        <>
          {t('forgotPassword.remembered', 'Remembered it?')}{' '}
          <Link to="/login" className={AUTH_LINK}>
            {t('forgotPassword.signIn', 'Sign in')}
          </Link>
        </>
      }
    >
      {isResolving ? (
        <SignInSkeleton rows={2} />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <Input
            label={t('forgotPassword.emailLabel', 'Email')}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" block loading={isSubmitting}>
            {t('forgotPassword.submit', 'Send reset link')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
