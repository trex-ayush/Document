import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Button from '@/components/ui/Button.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import Badge from '@/components/ui/Badge.jsx';
import { platformApi } from '@/services/platformApi.js';

const OPTIONS = [
  { value: 'google', label: 'Google only' },
  { value: 'password', label: 'Password only' },
  { value: 'both', label: 'Both' },
];

const OPTION_LABELS = Object.fromEntries(OPTIONS.map((o) => [o.value, o.label]));

/**
 * Standalone, top-level "Platform Settings" page (`/platform-settings`) — deployment-wide,
 * NOT per-family (docs/API.md "Platform settings"), so it deliberately is NOT nested under
 * the Settings tabs.
 *
 * Access gating: `GET /platform-settings` is public and there's no client-visible field
 * that says who the platform owner is (server-side-only by design, keyed off env
 * `PLATFORM_OWNER_EMAIL`), so this page can't hide itself from a route-guard perspective —
 * it renders for anyone who reaches it. It opens read-only with an "Edit" affordance; the
 * real enforcement is `PATCH /platform-settings` 403ing server-side for anyone but the
 * owner, which this page catches specifically and turns into a friendly message instead of
 * a raw error toast, rather than trying to guess ownership client-side.
 */
export default function PlatformSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => platformApi.get(),
  });

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const current = data?.allowedLoginMethods;

  const startEditing = () => {
    setSelected(current || 'both');
    setForbidden(false);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setForbidden(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setForbidden(false);
    try {
      const updated = await platformApi.update({ allowedLoginMethods: selected });
      queryClient.setQueryData(['platform-settings'], updated);
      toast.success('Platform sign-in policy saved');
      setEditing(false);
    } catch (err) {
      if (err?.response?.status === 403) {
        setForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || 'Could not save the platform sign-in policy.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader
        title="Platform Settings"
        subtitle="Deployment-wide sign-in policy — applies to every family on this instance."
      />

      <Card>
        <CardBody className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load platform settings.</p>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Allowed sign-in methods
                </p>

                {!editing ? (
                  <div className="flex items-center gap-3">
                    <Badge tone="blue">{OPTION_LABELS[current] || current}</Badge>
                    <Button variant="outline" size="sm" onClick={startEditing}>
                      Edit
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 max-w-md">
                      {OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSelected(opt.value)}
                          className={`min-h-[44px] rounded-lg border px-3 text-sm font-medium transition-colors ${
                            selected === opt.value
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                              : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button onClick={handleSave} loading={saving}>
                        Save
                      </Button>
                      <Button variant="secondary" onClick={cancelEditing} disabled={saving}>
                        Cancel
                      </Button>
                    </div>

                    {forbidden && (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        You don&apos;t have permission to change this. Only the configured platform owner can update
                        deployment-wide settings.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Controls whether sign-in and sign-up across the whole deployment can use Google, password, or
                either — separate from any one member&apos;s own sign-in method (set per-member on the Members
                page).
              </p>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
