import { useState } from 'react';
import Input from '@/components/ui/Input.jsx';
import Button from '@/components/ui/Button.jsx';

/**
 * GoogleSignupStep — the inline "name your family's vault" step shown when
 * `POST /auth/google` responds `{ needsSignup: true, signupToken, profile }`
 * (a brand-new Google identity with no existing family/account). Shared by
 * Login.jsx and Signup.jsx — either page's Google button can trigger this.
 *
 * Props: profile { name, email, avatarUrl }, defaultFamilyName?, onSubmit(familyName) -> Promise, onCancel
 */
export default function GoogleSignupStep({ profile, defaultFamilyName = '', onSubmit, onCancel }) {
  const [familyName, setFamilyName] = useState(defaultFamilyName);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = familyName.trim();
    if (!trimmed) {
      setError('Family name is required');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not finish setting up your vault.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="flex items-center gap-3">
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : null}
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Welcome, {profile?.name || 'there'}! Name your family&apos;s vault to finish setting up{' '}
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{profile?.email}</span>.
        </p>
      </div>

      <Input
        label="Family name"
        placeholder="The Singh Family"
        value={familyName}
        onChange={(e) => setFamilyName(e.target.value)}
        error={error}
        autoFocus
      />

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Back
        </Button>
        <Button type="submit" block loading={submitting}>
          Create vault
        </Button>
      </div>
    </form>
  );
}
