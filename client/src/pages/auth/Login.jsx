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
import Spinner from '@/components/ui/Spinner.jsx';
import AuthLayout from './AuthLayout.jsx';
import GoogleSignInButton, { AuthDivider } from './GoogleSignInButton.jsx';
import { SignInSkeleton, GoogleUnavailableNote } from './SignInPolicy.jsx';
import { Eye, EyeOff } from 'lucide-react';

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
    try {
      await login(data);
      redirectAfterAuth();
    } catch (err) {
      if (isLoginMethodNotAllowed(err)) {
        toast.error(t('signInMethods.googleOnlyError', 'This app only allows Google sign-in.'));
        refetchMethods();
        return;
      }
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
      if (isLoginMethodNotAllowed(err)) {
        toast.error(t('signInMethods.passwordOnlyError', 'This app only allows email and password sign-in.'));
        refetchMethods();
        return;
      }
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
      {isResolving ? (
        <SignInSkeleton />
      ) : (
        <>
          {showGoogle && <GoogleSignInButton onCredential={handleGoogleCredential} enableOneTap />}
          {showGoogle && allowPassword && <AuthDivider label={t('google.or', 'or')} />}
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
                      <EyeOff className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                    )}
                  </button>
                }
                {...register('password')}
              />

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
