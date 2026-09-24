import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext.jsx';
import { env } from '@/config/env.js';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import AuthLayout from './AuthLayout.jsx';
import GoogleSignInButton, { AuthDivider } from './GoogleSignInButton.jsx';
import GoogleSignupStep from './GoogleSignupStep.jsx';

function familyNameFromProfile(name) {
  const surname = name?.trim().split(/\s+/).slice(-1)[0];
  return surname ? `${surname} Family` : '';
}

const signupSchema = z
  .object({
    familyName: z.string().min(1, 'Family name is required').max(120, 'Keep it under 120 characters'),
    name: z.string().min(1, 'Your name is required').max(120, 'Keep it under 120 characters'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
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
 * Signup page — creates a new Family + first (admin/owner) User in one call
 * (`POST /auth/signup`, docs/API.md). Public route (`/signup`) — see this
 * agent's final report for the exact route the lead should wire in
 * AppRouter.jsx.
 */
export default function Signup() {
  const { signup, loginWithGoogle, completeGoogleSignup, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [googlePending, setGooglePending] = useState(null); // { signupToken, profile } | null

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { familyName: '', name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async ({ confirmPassword, ...data }) => {
    try {
      await signup(data);
      toast.success('Welcome to Family Vault!');
      navigate('/', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.code;
      const message =
        code === 'EMAIL_TAKEN'
          ? 'An account with that email already exists.'
          : err?.response?.data?.message || 'Could not create your vault. Please try again.';
      toast.error(message);
    }
  };

  const handleGoogleCredential = async (credential) => {
    try {
      const result = await loginWithGoogle(credential);
      if (result?.needsSignup) {
        setGooglePending(result);
      } else {
        // An existing Google-linked account signed in from the signup page — just enter the app.
        navigate('/', { replace: true });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not sign in with Google.');
    }
  };

  const handleCompleteGoogleSignup = async (familyName) => {
    await completeGoogleSignup({ signupToken: googlePending.signupToken, familyName });
    toast.success('Welcome to Family Vault!');
    navigate('/', { replace: true });
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  if (googlePending) {
    return (
      <AuthLayout title="Almost there" subtitle="One more step to finish creating your vault">
        <GoogleSignupStep
          profile={googlePending.profile}
          defaultFamilyName={familyNameFromProfile(googlePending.profile?.name)}
          onSubmit={handleCompleteGoogleSignup}
          onCancel={() => setGooglePending(null)}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your family vault"
      subtitle="One place for every document, password, and record"
      footer={
        <>
          Already have a vault?{' '}
          <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            Sign in
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
          label="Family name"
          placeholder="The Singh Family"
          error={errors.familyName?.message}
          {...register('familyName')}
        />
        <Input label="Your name" placeholder="Ayush Singh" error={errors.name?.message} {...register('name')} />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
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
          Create vault
        </Button>
      </form>
    </AuthLayout>
  );
}
