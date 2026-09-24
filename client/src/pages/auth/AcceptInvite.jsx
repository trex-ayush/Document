import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext.jsx';
import { authApi } from '@/services/authApi.js';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import AuthLayout from './AuthLayout.jsx';
import GoogleSignInButton, { AuthDivider } from './GoogleSignInButton.jsx';

const acceptInviteSchema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

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
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const { acceptInvite, loginWithGoogle, isAuthenticated } = useAuth();

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
      toast.success('Welcome to Family Vault!');
      navigate('/', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'ALREADY_ACCEPTED') {
        toast.error('This invite has already been accepted — sign in instead.');
        navigate('/login', { replace: true });
      } else {
        toast.error(err?.response?.data?.message || 'Could not accept this invite. Please try again.');
      }
    }
  };

  const handleGoogleCredential = async (credential) => {
    try {
      const result = await loginWithGoogle(credential);
      if (!result?.needsSignup) {
        navigate('/', { replace: true });
      } else {
        toast.error('This Google account has no pending invite — sign up instead.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not sign in with Google.');
    }
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  if (status === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthLayout
        title="Invite link expired"
        subtitle="This invite link is invalid or has expired"
        footer={
          <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Ask your family admin to resend the invite from the Members page.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={context.familyName ? `Join ${context.familyName}` : "You're invited"}
      subtitle={context.email}
      footer={
        <>
          Already accepted?{' '}
          <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {context.allowsGoogle && (
        <>
          <GoogleSignInButton onCredential={handleGoogleCredential} text="signin_with" />
          <AuthDivider label="or set a password" />
        </>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          help={!errors.password ? 'At least 8 characters, with a letter and a number' : undefined}
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" block loading={isSubmitting}>
          Accept invite
        </Button>
      </form>
    </AuthLayout>
  );
}
