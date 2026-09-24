import { useCallback, useState } from 'react';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { authApi } from '@/services/authApi.js';
import { env } from '@/config/env.js';
import GoogleSignInButton, { AuthDivider } from '@/pages/auth/GoogleSignInButton.jsx';

/**
 * ReauthPrompt — shared "confirm it's you" dialog for `POST /auth/reauth`
 * (docs/API.md). Gated features (revealing a sensitive custom-field/vault-item
 * value, setting a first password on a Google-only account) call this before
 * the real action when `Family.settings.requireReauthForSecrets` is on
 * (the default).
 *
 * Offers a password field and/or a "Continue with Google" button depending
 * on `user.authProviders` (docs/DECISIONS.md "Google sign-in" — reauth
 * accepts either path). Built here (Settings > Password/Account need it) and
 * exported for reuse anywhere else in the app that reveals a sensitive value
 * — e.g. Agent E's Document detail "reveal" action.
 *
 * ### Two ways to use it
 *
 * 1. Controlled component:
 *    ```jsx
 *    <ReauthPrompt isOpen={open} onClose={() => setOpen(false)}
 *      onSuccess={(reauthToken) => documentsApi.revealField(docId, fieldId, reauthToken)} />
 *    ```
 * 2. `useReauth()` hook — imperative, promise-based, no state to manage:
 *    ```jsx
 *    const { requestReauth, reauthModal } = useReauth();
 *    async function reveal() {
 *      try {
 *        const reauthToken = await requestReauth('Confirm your identity to view this password.');
 *        const { value } = await documentsApi.revealField(docId, fieldId, reauthToken);
 *      } catch {
 *        // user cancelled — requestReauth's promise rejects
 *      }
 *    }
 *    return <>{page}{reauthModal}</>;
 *    ```
 *
 * Props: isOpen, onClose, onSuccess(reauthToken), description? (string shown above the form).
 */
export default function ReauthPrompt({ isOpen, onClose, onSuccess, description }) {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const providers = user?.authProviders?.length ? user.authProviders : ['password'];
  const hasPassword = providers.includes('password');
  const hasGoogle = providers.includes('google') && !!env.googleClientId;

  const reset = () => {
    setPassword('');
    setError('');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const submitWith = useCallback(
    async (payload) => {
      setSubmitting(true);
      setError('');
      try {
        const { reauthToken } = await authApi.reauth(payload);
        reset();
        onSuccess?.(reauthToken);
      } catch (err) {
        const code = err?.response?.data?.code;
        setError(
          code === 'GOOGLE_REAUTH_INVALID'
            ? 'Could not verify your Google identity. Please try again.'
            : err?.response?.data?.message || 'That password is incorrect.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [onSuccess],
  );

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!password) {
      setError('Enter your password');
      return;
    }
    submitWith({ password });
  };

  const handleGoogleCredential = (credential) => submitWith({ credential });

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Confirm it's you" size="sm">
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        {description || 'For your security, please confirm your identity before continuing.'}
      </p>

      {hasGoogle && (
        <div className="mb-1">
          <GoogleSignInButton onCredential={handleGoogleCredential} text="continue_with" />
        </div>
      )}

      {hasGoogle && hasPassword && <AuthDivider />}

      {hasPassword && (
        <form onSubmit={handlePasswordSubmit} noValidate className="space-y-3">
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error && hasPassword ? error : undefined}
          />
          <Button type="submit" block loading={submitting}>
            Confirm
          </Button>
        </form>
      )}

      {!hasPassword && !hasGoogle && (
        <p className="text-sm text-red-600 dark:text-red-400">
          No sign-in method is available to verify your identity. Contact your family admin.
        </p>
      )}
      {!hasPassword && hasGoogle && error && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
      )}
    </Modal>
  );
}

/**
 * useReauth() — imperative wrapper around `<ReauthPrompt>`. Call
 * `requestReauth(description?)`, await it for the `reauthToken`, render
 * `{reauthModal}` once somewhere in the tree. The promise rejects (message
 * `'REAUTH_CANCELLED'`) if the user closes the dialog without completing it.
 */
export function useReauth() {
  const [state, setState] = useState({ isOpen: false, resolve: null, reject: null, description: undefined });

  const requestReauth = useCallback((description) => {
    return new Promise((resolve, reject) => {
      setState({ isOpen: true, resolve, reject, description });
    });
  }, []);

  const handleSuccess = (token) => {
    state.resolve?.(token);
    setState((s) => ({ ...s, isOpen: false, resolve: null, reject: null }));
  };

  const handleClose = () => {
    state.reject?.(new Error('REAUTH_CANCELLED'));
    setState((s) => ({ ...s, isOpen: false, resolve: null, reject: null }));
  };

  const reauthModal = (
    <ReauthPrompt
      isOpen={state.isOpen}
      onClose={handleClose}
      onSuccess={handleSuccess}
      description={state.description}
    />
  );

  return { requestReauth, reauthModal };
}
