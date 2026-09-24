import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { authApi } from '@/services/authApi.js';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import AuthLayout from './AuthLayout.jsx';

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

/**
 * Password reset page. Public route (`/reset-password?token=...`) — see
 * this agent's final report for the exact route the lead should wire in
 * AppRouter.jsx. Reads `token` from the query string (the link a
 * password-reset email points to).
 */
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const [expired, setExpired] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async ({ newPassword }) => {
    try {
      await authApi.resetPassword({ token, newPassword });
      toast.success('Password updated — sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'INVALID_OR_EXPIRED_TOKEN') {
        setExpired(true);
      } else {
        toast.error(err?.response?.data?.message || 'Could not reset your password. Please try again.');
      }
    }
  };

  if (!token || expired) {
    return (
      <AuthLayout
        title="Link expired"
        subtitle="This password reset link is invalid or has expired"
        footer={
          <Link to="/login" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Button as={Link} to="/forgot-password" block>
          Request a new link
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a new password for your account">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          help={!errors.newPassword ? 'At least 8 characters, with a letter and a number' : undefined}
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" block loading={isSubmitting}>
          Reset password
        </Button>
      </form>
      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
        This will sign you out of every other device.
      </p>
    </AuthLayout>
  );
}
