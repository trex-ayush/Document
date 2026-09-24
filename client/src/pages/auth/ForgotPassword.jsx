import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { authApi } from '@/services/authApi.js';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import AuthLayout from './AuthLayout.jsx';

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

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
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async ({ email }) => {
    try {
      await authApi.forgotPassword(email);
    } catch (err) {
      // A rate-limit (or network) error is the one case worth surfacing — everything else stays
      // silent so the page never hints at whether the account exists.
      if (err?.response?.status === 429) {
        toast.error(err?.response?.data?.message || 'Too many requests — please try again later.');
        return;
      }
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="If an account with that email exists, we've sent a password reset link"
        footer={
          <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The link expires in 30 minutes. Didn&apos;t get it? Check your spam folder, or try again below.
        </p>
        <Button variant="secondary" block className="mt-4" onClick={() => setSent(false)}>
          Try a different email
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link"
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" block loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
