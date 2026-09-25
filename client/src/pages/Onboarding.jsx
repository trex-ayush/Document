import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import AuthLayout from './auth/AuthLayout.jsx';

/**
 * Onboarding — first-run "Create your family" screen (multi-family
 * accounts: docs/API.md "Multi-family sessions" / docs/DECISIONS.md
 * "Multi-family accounts"). Shown for a logged-in user with zero
 * memberships — a genuinely cold signup/login with no auto-joined invite —
 * since family creation moved out of `POST /auth/signup` into its own
 * `POST /family`.
 *
 * No sidebar/navbar chrome (there's no active family yet to scope
 * `AppShell`'s nav to), same spirit as the auth pages — reuses
 * `pages/auth/AuthLayout.jsx` for the centered-card shell.
 *
 * **Router wiring (lead-owned, AppRouter.jsx) — see this agent's final
 * report**: mounted at `/onboarding`, guarded so only an authenticated user
 * with `memberships.length === 0` lands here, and redirected away (to `/`)
 * once `createFamily` succeeds and `memberships` is non-empty — this
 * component itself calls `navigate('/', {replace: true})` after creating,
 * so the guard only needs to handle the *other* direction (bounce here when
 * memberships is empty, bounce away if somehow visited with memberships
 * already present).
 */
export default function Onboarding() {
  const { t } = useTranslation('auth');
  const { user, memberships, createFamily, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Already has at least one family — nothing to onboard, send them into the app.
  if (memberships.length > 0) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('onboarding.nameRequired', 'Please type a name for your family'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await createFamily(trimmed);
      toast.success(t('onboarding.created', 'Your family vault is ready!'));
      navigate('/', { replace: true });
    } catch (err) {
      const message = err?.response?.data?.message || t('onboarding.createFailed', 'Could not create your family. Please try again.');
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      photo="family"
      heroImage="/assets/welcome-onboarding.png"
      title={t('onboarding.title', 'Create your family')}
      subtitle={
        user?.name
          ? t('onboarding.subtitleNamed', 'Welcome, {{name}}! Give your family’s vault a name to get started.', { name: user.name.split(' ')[0] })
          : t('onboarding.subtitle', 'Give your family’s vault a name to get started.')
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label={t('onboarding.nameLabel', 'Family name')}
          placeholder={t('onboarding.namePlaceholder', 'The Singh Family')}
          value={name}
          maxLength={150}
          onChange={(e) => setName(e.target.value)}
          error={error}
          autoFocus
        />
        <Button type="submit" block loading={submitting}>
          {t('onboarding.submit', 'Create our vault')}
        </Button>
      </form>
    </AuthLayout>
  );
}
