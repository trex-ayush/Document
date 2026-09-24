import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Switch from '@/components/ui/Switch.jsx';
import Button from '@/components/ui/Button.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import { meApi } from '@/services/meApi.js';
import { familyApi } from '@/services/familyApi.js';

const EVENT_KEYS = [
  'member_added',
  'member_removed',
  'member_disabled',
  'member_access_change',
  'invite_accepted',
  'share_sensitive',
  'share_lockout',
  'document_folder_delete',
  'failed_logins',
  'new_device_login',
  'storage_threshold',
];

const EVENT_LABELS = {
  member_added: 'A member is added',
  member_removed: 'A member is removed',
  member_disabled: 'A member is disabled',
  member_access_change: "A member's access level changes",
  invite_accepted: 'An invite is accepted',
  share_sensitive: 'A share link including sensitive fields is created',
  share_lockout: 'A share link is locked out after repeated wrong passwords',
  document_folder_delete: 'A document or folder is deleted',
  failed_logins: 'There are repeated failed sign-in attempts',
  new_device_login: 'A sign-in happens from a new device',
  storage_threshold: 'Storage usage crosses a threshold',
};

/**
 * Settings > Notifications tab — admin only. Per-event instant-alert toggles
 * (`GET`/`PATCH /me/notification-prefs`) + a "Send test email" button
 * (`POST /family/test-email`). Shows an "email not configured" banner
 * instead of pretending toggles do anything useful when `family.emailEnabled`
 * is false (docs/DECISIONS.md "Email & notifications").
 */
export default function SettingsNotifications({ family }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notification-prefs'], queryFn: () => meApi.getNotificationPrefs() });
  const [testSending, setTestSending] = useState(false);
  const [savingKey, setSavingKey] = useState(null);

  const instant = data?.instant || {};

  const handleToggle = async (key, checked) => {
    const previous = queryClient.getQueryData(['notification-prefs']);
    queryClient.setQueryData(['notification-prefs'], (old) => ({ instant: { ...(old?.instant || {}), [key]: checked } }));
    setSavingKey(key);
    try {
      await meApi.updateNotificationPrefs({ instant: { [key]: checked } });
    } catch (err) {
      queryClient.setQueryData(['notification-prefs'], previous);
      toast.error(err?.response?.data?.message || 'Could not save that preference.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleTestEmail = async () => {
    setTestSending(true);
    try {
      const res = await familyApi.testEmail();
      toast.success(
        res.emailEnabled
          ? 'Test email sent — check your inbox.'
          : 'Email is not configured, so nothing was actually delivered (the server just logged it).',
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not send the test email.');
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {family && !family.emailEnabled && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-400">
          Email isn&apos;t configured for this deployment — alerts won&apos;t actually be delivered (they&apos;re only
          logged on the server).
        </div>
      )}

      <Card>
        <CardBody>
          <p className="font-medium text-neutral-900 dark:text-neutral-100 mb-3">Instant alerts</p>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {EVENT_KEYS.map((key) => (
                <div key={key} className="py-2.5 flex items-center justify-between gap-3">
                  <Switch
                    label={EVENT_LABELS[key] || key}
                    checked={instant[key] !== false}
                    disabled={savingKey === key}
                    onChange={(e) => handleToggle(key, e.target.checked)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Button variant="outline" onClick={handleTestEmail} loading={testSending}>
        Send test email
      </Button>
    </div>
  );
}
