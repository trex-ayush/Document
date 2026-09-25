import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { authApi } from '@/services/authApi.js';
import { useSignInMethods, isLoginMethodNotAllowed } from '@/hooks/useSignInMethods.js';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import AuthLayout from './AuthLayout.jsx';
import GoogleSignInButton, { AuthDivider } from './GoogleSignInButton.jsx';
import { GoogleUnavailableNote } from './SignInPolicy.jsx';

/**
 * Accept-invite page. Public route (`/accept-invite?token=...`) — see this
 * agent's final report for the exact route the lead should wire in
 * AppRouter.jsx. Reads `token` from the query string (the link a member
 * invite email points to).
 *
 * Loads the invite's context first (`GET /auth/accept-invite/:token`, no
 * side effects) so the page can show who/what the invite is for, and offer
 * "Continue with Google" only when the invite actually allows it
 * (`allowsGoogle`) — same Google flow Login/Signup use: `POST /auth/google`
 * finds the pre-created User row by email and activates the Membership
 * automatically (see auth/service.js's `loadActiveMembershipOrThrow`), so it
 * bypasses this page's password form entirely.
 */
export default function AcceptInvite() {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const { acceptInvite, loginWithGoogle, isAuthenticated } = useAuth();
  const { method, showGoogle, showPassword, googleUnavailable, isResolving, refetch: refetchMethods } = useSignInMethods();

  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'invalid'
  const [context, setContext] = useState(null); // { email, familyName, allowsGoogle }

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    let cancelled = false;
    authApi
      .getInviteContext(token)
      .then((data) => {
        if (!cancelled) {
          setContext(data);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const acceptInviteSchema = z
    .object({
      password: z
        .string()
        .min(8, t('validation.passwordMinLength', 'At least 8 characters'))
        .regex(/[a-zA-Z]/, t('validation.passwordLetter', 'Include at least one letter'))
        .regex(/[0-9]/, t('validation.passwordNumber', 'Include at least one number')),
      confirmPassword: z.string().min(1, t('validation.confirmPassword', 'Confirm your password')),
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
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async ({ password }) => {
    try {
      await acceptInvite({ token, password });
      toast.success(t('acceptInvite.welcome', 'Welcome to Family Vault!'));
      navigate('/', { replace: true });
    } catch (err) {
      if (isLoginMethodNotAllowed(err)) {
        toast.error(t('signInMethods.googleOnlyError', 'This app only allows Google sign-in.'));
        refetchMethods();
        return;
      }
      const code = err?.response?.data?.code;
      if (code === 'ALREADY_ACCEPTED') {
        toast.error(t('acceptInvite.alreadyAcceptedError', 'This invite has already been accepted — sign in instead.'));
        navigate('/login', { replace: true });
      } else {
        toast.error(err?.response?.data?.message || t('acceptInvite.failed', 'Could not accept this invite. Please try again.'));
      }
    }
  };

  const handleGoogleCredential = async (credential) => {
    try {
      const result = await loginWithGoogle(credential);
      if (!result?.needsSignup) {
        navigate('/', { replace: true });
      } else {
        toast.error(t('acceptInvite.noInviteForGoogle', 'This Google account has no pending invite — sign up instead.'));
      }
    } catch (err) {
      if (isLoginMethodNotAllowed(err)) {
        toast.error(t('signInMethods.passwordOnlyError', 'This app only allows email and password sign-in.'));
        refetchMethods();
        return;
      }
      toast.error(err?.response?.data?.message || t('acceptInvite.googleFailed', 'Could not sign in with Google.'));
    }
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  if (status === 'loading' || isResolving) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthLayout
        title={t('acceptInvite.inviteExpiredTitle', 'Invite link expired')}
        subtitle={t('acceptInvite.inviteExpiredSubtitle', 'This invite link is invalid or has expired')}
        footer={
          <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            {t('acceptInvite.backToSignIn', 'Back to sign in')}
          </Link>
        }
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t('acceptInvite.askAdmin', 'Ask your family admin to resend the invite from the Members page.')}
        </p>
      </AuthLayout>
    );
  }

  // Google-only app: always offer Google (it's the only way in). 'both': only when the invite allows it.
  const inviteShowsGoogle = showGoogle && (method === 'google' || context.allowsGoogle);

  return (
    <AuthLayout
      title={context.familyName ? t('acceptInvite.joinFamily', 'Join {{familyName}}', { familyName: context.familyName }) : t('acceptInvite.youAreInvited', "You're invited")}
      subtitle={context.email}
      footer={
        <>
          {t('acceptInvite.alreadyAccepted', 'Already accepted?')}{' '}
          <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            {t('acceptInvite.signIn', 'Sign in')}
          </Link>
        </>
      }
    >
      {inviteShowsGoogle && <GoogleSignInButton onCredential={handleGoogleCredential} text="signin_with" />}
      {inviteShowsGoogle && showPassword && <AuthDivider label={t('acceptInvite.orSetPassword', 'or set a password')} />}
      {googleUnavailable && <GoogleUnavailableNote />}
      {showPassword && (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Input
            label={t('acceptInvite.passwordLabel', 'Password')}
            type="password"
            autoComplete="new-password"
            placeholder={t('acceptInvite.passwordPlaceholder', 'At least 8 characters')}
            help={!errors.password ? t('acceptInvite.passwordHelp', 'At least 8 characters, with a letter and a number') : undefined}
            error={errors.password?.message}
            {...register('password')}
          />
          <Input
            label={t('acceptInvite.confirmPasswordLabel', 'Confirm password')}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" block loading={isSubmitting}>
            {t('acceptInvite.submit', 'Accept invite')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
