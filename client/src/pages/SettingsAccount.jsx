import { useState } from 'react';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Button from '@/components/ui/Button.jsx';
import Badge from '@/components/ui/Badge.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { authApi } from '@/services/authApi.js';
import { env } from '@/config/env.js';
import GoogleSignInButton from '@/pages/auth/GoogleSignInButton.jsx';

/** Settings > Account tab — Google connect/disconnect (`POST /auth/google/link` / `/unlink`). */
export default function SettingsAccount() {
  const { user, updateUser } = useAuth();
  const providers = user?.authProviders || [];
  const googleLinked = providers.includes('google');
  const hasPassword = providers.includes('password');
  const [unlinking, setUnlinking] = useState(false);

  const handleLink = async (credential) => {
    try {
      const { user: updated } = await authApi.googleLink(credential);
      updateUser(updated);
      toast.success('Google account linked');
    } catch (err) {
      const code = err?.response?.data?.code;
      toast.error(
        code === 'GOOGLE_ACCOUNT_ALREADY_LINKED'
          ? 'That Google account is already linked to a different user.'
          : err?.response?.data?.message || 'Could not link your Google account.',
      );
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      const { user: updated } = await authApi.googleUnlink();
      updateUser(updated);
      toast.success('Google account unlinked');
    } catch (err) {
      const code = err?.response?.data?.code;
      toast.error(
        code === 'CANNOT_UNLINK_ONLY_METHOD'
          ? 'Set a password first — you need at least one way to sign in.'
          : err?.response?.data?.message || 'Could not unlink your Google account.',
      );
    } finally {
      setUnlinking(false);
    }
  };

  if (!env.googleClientId) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Google sign-in isn&apos;t enabled for this deployment.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">Google account</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {googleLinked ? 'Connected — you can sign in with Google.' : 'Not connected.'}
            </p>
          </div>
          {googleLinked ? <Badge tone="green">Connected</Badge> : <Badge tone="gray">Not connected</Badge>}
        </div>

        {googleLinked ? (
          <div>
            <Button variant="outline" onClick={handleUnlink} loading={unlinking} disabled={!hasPassword}>
              Unlink Google
            </Button>
            {!hasPassword && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Set a password (Password tab) before you can unlink Google, so you always keep at least one
                way to sign in.
              </p>
            )}
          </div>
        ) : (
          <div className="max-w-xs">
            <GoogleSignInButton onCredential={handleLink} text="signin_with" />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
