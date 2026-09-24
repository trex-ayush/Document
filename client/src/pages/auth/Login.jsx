import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { env } from '@/config/env.js';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import AuthLayout from './AuthLayout.jsx';
import GoogleSignInButton, { AuthDivider } from './GoogleSignInButton.jsx';

/**
 * Login page. Public route (`/login`) — see this agent's final report for
 * the exact route the lead should wire in AppRouter.jsx.
 *
 * Google sign-in for a brand-new identity (`needsSignup: true`) completes
 * immediately (`completeGoogleSignup(signupToken)`, no family name to
 * collect anymore — multi-family accounts: docs/API.md "Multi-family
 * sessions") instead of showing an intermediate step; a zero-`memberships`
 * result then lands on Onboarding same as any other cold signup.
 */
export default function Login() {
  const { t } = useTranslation('auth');
  const { login, loginWithGoogle, completeGoogleSignup, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [googleCompleting, setGoogleCompleting] = useState(false);

  const loginSchema = z.object({
    email: z.string().min(1, t('validation.emailRequired', 'Email is required')).email(t('validation.emailInvalid', 'Enter a valid email address')),
    password: z.string().min(1, t('validation.passwordRequired', 'Password is required')),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const redirectAfterAuth = () => {
    const redirectTo = location.state?.from?.pathname || '/';
    navigate(redirectTo, { replace: true });
  };

  const onSubmit = async (data) => {
    try {
      await login(data);
      redirectAfterAuth();
    } catch (err) {
      const code = err?.response?.data?.code;
      const message =
        code === 'ACCOUNT_DISABLED'
          ? t('login.accountDisabled', 'This account has been disabled. Contact your family admin.')
          : err?.response?.data?.message || t('login.invalidCredentials', 'Invalid email or password.');
      toast.error(message);
    }
  };

  const handleGoogleCredential = async (credential) => {
    try {
      const result = await loginWithGoogle(credential);
      if (result?.needsSignup) {
        setGoogleCompleting(true);
        try {
          await completeGoogleSignup(result.signupToken);
          toast.success(t('login.welcomeBack', 'Welcome to Family Vault!'));
          redirectAfterAuth();
        } finally {
          setGoogleCompleting(false);
        }
      } else {
        redirectAfterAuth();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('login.googleFailed', 'Could not sign in with Google.'));
    }
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  if (googleCompleting) {
    return (
      <AuthLayout title={t('login.almostThere', 'Almost there')} subtitle={t('login.oneMoreStep', 'One moment...')}>
        <div className="flex justify-center py-6">
          <Spinner size="lg" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('login.title', 'Welcome back')}
      subtitle={t('login.subtitle', "Sign in to your family's vault")}
      footer={
        <>
          {t('login.noVault', "Don't have a vault yet?")}{' '}
          <Link to="/signup" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            {t('login.createOne', 'Create one')}
          </Link>
        </>
      }
    >
      {env.googleClientId && (
        <>
          <GoogleSignInButton onCredential={handleGoogleCredential} enableOneTap />
          <AuthDivider label={t('google.or', 'or')} />
        </>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label={t('login.emailLabel', 'Email')}
          type="email"
          autoComplete="email"
          placeholder={t('login.emailPlaceholder', 'you@example.com')}
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="password" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t('login.passwordLabel', 'Password')}
          </label>
          <Link to="/forgot-password" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
            {t('login.forgotPassword', 'Forgot password?')}
          </Link>
        </div>
        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          rightIcon={
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('login.hidePassword', 'Hide password') : t('login.showPassword', 'Show password')}
              className="pointer-events-auto"
            >
              {showPassword ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          }
          {...register('password')}
        />

        <Button type="submit" block loading={isSubmitting}>
          {t('login.submit', 'Sign in')}
        </Button>
      </form>
    </AuthLayout>
  );
}
