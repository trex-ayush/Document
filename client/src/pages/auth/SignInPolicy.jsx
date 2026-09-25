import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button.jsx';
import Skeleton from '@/components/ui/Skeleton.jsx';
import AuthLayout from './AuthLayout.jsx';

/**
 * Small pieces the auth pages share to follow the app's sign-in policy
 * (`hooks/useSignInMethods.js`): a placeholder while the policy loads, the
 * "Google sign-in only" screen for the password-reset pages, and a note for
 * the rare case the policy is Google-only but this build has no Google client id.
 */

/** Placeholder for the card's body while the sign-in policy is still loading (max ~3s). */
export function SignInSkeleton({ rows = 3 }) {
  const { t } = useTranslation('auth');
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{t('signInMethods.loading', 'Loading sign-in options...')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={44} width="100%" />
      ))}
    </div>
  );
}

/** Full screen for Forgot/Reset password when the app only allows Google sign-in. */
export function GoogleOnlyNotice() {
  const { t } = useTranslation('auth');
  return (
    <AuthLayout
      title={t('signInMethods.googleOnlyTitle', 'This app uses Google sign-in only')}
      subtitle={t('signInMethods.googleOnlySubtitle', "There's no password to reset. Sign in with your Google account instead.")}
    >
      <Button as={Link} to="/login" block>
        {t('signInMethods.backToSignIn', 'Back to sign in')}
      </Button>
    </AuthLayout>
  );
}

/** Shown in place of the Google button when the policy is Google-only but Google isn't set up in this build. */
export function GoogleUnavailableNote() {
  const { t } = useTranslation('auth');
  return (
    <p className="text-sm text-center text-neutral-600 dark:text-neutral-400">
      {t('signInMethods.googleUnavailable', "Google sign-in isn't set up on this app yet. Please contact the app's admin.")}
    </p>
  );
}
