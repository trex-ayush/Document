import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { useSignInMethods, isLoginMethodNotAllowed } from '@/hooks/useSignInMethods.js';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import PasswordInput from '@/components/ui/PasswordInput.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import { Notice } from '@/components/ui/PageState.jsx';
import AuthLayout, { AUTH_LINK } from './AuthLayout.jsx';
import GoogleSignInButton, { AuthDivider } from './GoogleSignInButton.jsx';
import { SignInSkeleton, GoogleUnavailableNote } from './SignInPolicy.jsx';

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
  const [googleCompleting, setGoogleCompleting] = useState(false);
  const [formError, setFormError] = useState('');
  const { showGoogle, showPassword: allowPassword, googleUnavailable, isResolving, refetch: refetchMethods } = useSignInMethods();

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
    setFormError('');
    try {
      await login(data);
      redirectAfterAuth();
    } catch (err) {
      if (isLoginMethodNotAllowed(err)) {
        setFormError(t('signInMethods.googleOnlyError', 'This app only allows Google sign-in.'));
        refetchMethods();
        return;
      }
      const code = err?.response?.data?.code;
      // The rate limiter answers 429 with no JSON message — say so instead of "wrong password".
      const message =
        err?.response?.status === 429
          ? t('forgotPassword.tooManyRequests', 'Too many requests — please try again later.')
          : code === 'ACCOUNT_DISABLED'
          ? t('login.accountDisabled', 'This account has been disabled. Contact your family admin.')
          : err?.response?.data?.message || t('login.invalidCredentials', 'Invalid email or password.');
      setFormError(message);
    }
  };

  const handleGoogleCredential = async (credential) => {
    setFormError('');
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
      if (isLoginMethodNotAllowed(err)) {
        setFormError(t('signInMethods.passwordOnlyError', 'This app only allows email and password sign-in.'));
        refetchMethods();
        return;
      }
      setFormError(err?.response?.data?.message || t('login.googleFailed', 'Could not sign in with Google.'));
    }
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  if (googleCompleting) {
    return (
      <AuthLayout photo="family" title={t('login.almostThere', 'Almost there')} subtitle={t('login.oneMoreStep', 'One moment...')}>
        <div className="flex justify-center py-6">
          <Spinner size="lg" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      photo="family"
      title={t('login.title', 'Welcome back')}
      subtitle={t('login.subtitle', "Sign in to your family's vault")}
      footer={
        <>
          {t('login.noVault', "Don't have a vault yet?")}{' '}
          <Link to="/signup" className={AUTH_LINK}>
            {t('login.createOne', 'Create one')}
          </Link>
        </>
      }
    >
      {isResolving ? (
        <SignInSkeleton />
      ) : (
        <>
          {formError && <Notice tone="error" className="mb-4">{formError}</Notice>}
          {showGoogle && <GoogleSignInButton onCredential={handleGoogleCredential} enableOneTap />}
          {showGoogle && allowPassword && <AuthDivider label={t('google.orEmail', 'or use your email')} />}
          {googleUnavailable && <GoogleUnavailableNote />}
          {allowPassword && (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              <Input
                label={t('login.emailLabel', 'Email')}
                type="email"
                autoComplete="email"
                placeholder={t('login.emailPlaceholder', 'you@example.com')}
                error={errors.email?.message}
                {...register('email')}
              />
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="password" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t('login.passwordLabel', 'Password')}
                  </label>
                  <Link to="/forgot-password" className={`text-sm ${AUTH_LINK}`}>
                    {t('login.forgotPassword', 'Forgot password?')}
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  error={errors.password?.message}
                  {...register('password')}
                />
              </div>

              <Button type="submit" block loading={isSubmitting}>
                {t('login.submit', 'Sign in')}
              </Button>
            </form>
          )}
        </>
      )}
    </AuthLayout>
  );
}
