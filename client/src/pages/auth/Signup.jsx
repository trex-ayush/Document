import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
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
 * Signup page — creates only the User (`POST /auth/signup`, docs/API.md).
 * **No family name is collected here anymore** (multi-family accounts:
 * docs/API.md "Multi-family sessions" / docs/DECISIONS.md "Multi-family
 * accounts") — family creation moved to its own `POST /family`, used by the
 * first-run "Create your family" onboarding screen (`pages/Onboarding.jsx`,
 * shown when the applied session's `memberships` comes back empty) and the
 * family switcher's "+ Create a new family" action for an existing user.
 * One or more `memberships` after signup means auto-join matched a pending
 * invite for this email — the router-level guard (see this agent's final
 * report) sends the user straight into the app in that case instead.
 *
 * Public route (`/signup`) — see this agent's final report for the exact
 * route/guard the lead should wire in AppRouter.jsx.
 */
export default function Signup() {
  const { t } = useTranslation('auth');
  const { signup, loginWithGoogle, completeGoogleSignup, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [googleCompleting, setGoogleCompleting] = useState(false);

  const signupSchema = z
    .object({
      name: z.string().min(1, t('signup.nameRequired', 'Your name is required')).max(120, t('signup.nameMaxLength', 'Keep it under 120 characters')),
      email: z.string().min(1, t('validation.emailRequired', 'Email is required')).email(t('validation.emailInvalid', 'Enter a valid email address')),
      password: z
        .string()
        .min(8, t('validation.passwordMinLength', 'At least 8 characters'))
        .regex(/[a-zA-Z]/, t('validation.passwordLetter', 'Include at least one letter'))
        .regex(/[0-9]/, t('validation.passwordNumber', 'Include at least one number')),
      confirmPassword: z.string().min(1, t('validation.confirmPasswordRequired', 'Confirm your password')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('validation.passwordsMismatch', "Passwords don't match"),
      path: ['confirmPassword'],
    });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async ({ confirmPassword, ...data }) => {
    try {
      await signup(data);
      toast.success(t('signup.welcome', 'Welcome to Family Vault!'));
      navigate('/', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.code;
      const message =
        code === 'EMAIL_TAKEN'
          ? t('signup.emailTaken', 'An account with that email already exists.')
          : err?.response?.data?.message || t('signup.failed', 'Could not create your account. Please try again.');
      toast.error(message);
    }
  };

  const handleGoogleCredential = async (credential) => {
    try {
      const result = await loginWithGoogle(credential);
      if (result?.needsSignup) {
        // Brand-new Google identity — nothing left to collect (no family
        // name anymore), finish the signup immediately.
        setGoogleCompleting(true);
        try {
          await completeGoogleSignup(result.signupToken);
          toast.success(t('signup.welcome', 'Welcome to Family Vault!'));
          navigate('/', { replace: true });
        } finally {
          setGoogleCompleting(false);
        }
      } else {
        // An existing Google-linked account signed in from the signup page — just enter the app.
        navigate('/', { replace: true });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('signup.googleFailed', 'Could not sign in with Google.'));
    }
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  if (googleCompleting) {
    return (
      <AuthLayout title={t('signup.settingUp', 'Setting up your account')} subtitle={t('signup.oneMoment', 'One moment...')}>
        <div className="flex justify-center py-6">
          <Spinner size="lg" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('signup.title', 'Create your account')}
      subtitle={t('signup.subtitle', 'One place for every document, password, and record')}
      footer={
        <>
          {t('signup.haveAccount', 'Already have an account?')}{' '}
          <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            {t('signup.signIn', 'Sign in')}
          </Link>
        </>
      }
    >
      {env.googleClientId && (
        <>
          <GoogleSignInButton onCredential={handleGoogleCredential} />
          <AuthDivider />
        </>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label={t('signup.nameLabel', 'Your name')}
          placeholder={t('signup.namePlaceholder', 'Ayush Singh')}
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label={t('signup.emailLabel', 'Email')}
          type="email"
          autoComplete="email"
          placeholder={t('signup.emailPlaceholder', 'you@example.com')}
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label={t('signup.passwordLabel', 'Password')}
          type="password"
          autoComplete="new-password"
          placeholder={t('signup.passwordPlaceholder', 'At least 8 characters')}
          help={!errors.password ? t('signup.passwordHelp', 'At least 8 characters, with a letter and a number') : undefined}
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label={t('signup.confirmPasswordLabel', 'Confirm password')}
          type="password"
          autoComplete="new-password"
          placeholder={t('signup.confirmPasswordPlaceholder', '••••••••')}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" block loading={isSubmitting}>
          {t('signup.submit', 'Create account')}
        </Button>
      </form>
    </AuthLayout>
  );
}
