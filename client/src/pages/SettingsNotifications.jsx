import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { SectionCard } from '@/components/ui/Card.jsx';
import Switch from '@/components/ui/Switch.jsx';
import Button from '@/components/ui/Button.jsx';
import { Notice } from '@/components/ui/PageState.jsx';
import { Skeleton } from '@/components/ui/Skeleton.jsx';
import { meApi } from '@/services/meApi.js';
import { familyApi } from '@/services/familyApi.js';

const EVENT_KEYS = [
  'member_added',
  'member_removed',
  'member_disabled',
  'member_access_change',
  'invite_accepted',
  'document_folder_delete',
  'failed_logins',
  'new_device_login',
  'storage_threshold',
];

const EVENT_LABEL_KEYS = {
  member_added: 'notifications.events.memberAdded',
  member_removed: 'notifications.events.memberRemoved',
  member_disabled: 'notifications.events.memberDisabled',
  member_access_change: 'notifications.events.memberAccessChange',
  invite_accepted: 'notifications.events.inviteAccepted',
  document_folder_delete: 'notifications.events.documentFolderDelete',
  failed_logins: 'notifications.events.failedLogins',
  new_device_login: 'notifications.events.newDeviceLogin',
  storage_threshold: 'notifications.events.storageThreshold',
};

const EVENT_LABELS_EN = {
  member_added: 'A member is added',
  member_removed: 'A member is removed',
  member_disabled: 'A member is disabled',
  member_access_change: "A member's access level changes",
  invite_accepted: 'An invite is accepted',
  document_folder_delete: 'A document or folder is deleted',
  failed_logins: 'There are repeated failed sign-in attempts',
  new_device_login: 'A sign-in happens from a new device',
  storage_threshold: 'Storage usage crosses a threshold',
};

/**
 * Settings > Family tab > Notifications section — admin only. Per-event instant-alert toggles
 * (`GET`/`PATCH /me/notification-prefs`) + a "Send test email" button
 * (`POST /family/test-email`). Shows an "email not configured" banner
 * instead of pretending toggles do anything useful when `family.emailEnabled`
 * is false (docs/DECISIONS.md "Email & notifications").
 */
export default function SettingsNotifications({ family }) {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notification-prefs'], queryFn: () => meApi.getNotificationPrefs() });
  const [testSending, setTestSending] = useState(false);
  const [savingKey, setSavingKey] = useState(null);

  const instant = data?.instant || {};

  const eventLabel = (key) => t(EVENT_LABEL_KEYS[key] || key, EVENT_LABELS_EN[key] || key);

  const handleToggle = async (key, checked) => {
    const previous = queryClient.getQueryData(['notification-prefs']);
    queryClient.setQueryData(['notification-prefs'], (old) => ({ instant: { ...(old?.instant || {}), [key]: checked } }));
    setSavingKey(key);
    try {
      await meApi.updateNotificationPrefs({ instant: { [key]: checked } });
    } catch (err) {
      queryClient.setQueryData(['notification-prefs'], previous);
      toast.error(err?.response?.data?.message || t('notifications.saveFailed', 'Could not save that preference.'));
    } finally {
      setSavingKey(null);
    }
  };

  const handleTestEmail = async () => {
    setTestSending(true);
    try {
      const res = await familyApi.testEmail();
      if (res.ok) {
        toast.success(t('notifications.testEmailSent', 'Test email sent — check your inbox.'));
      } else if (res.error === 'EMAIL_DISABLED') {
        toast.error(t('notifications.testEmailNotConfigured', 'Email is not configured, so nothing was actually delivered (the server just logged it).'));
      } else {
        toast.error(res.hint || t('notifications.testEmailFailed', 'Could not send the test email.'));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('notifications.testEmailFailed', 'Could not send the test email.'));
    } finally {
      setTestSending(false);
    }
  };

  return (
    <SectionCard
      id="settings-notifications"
      title={t('tabs.notifications', 'Notifications')}
      description={t('notifications.instantAlerts', 'Instant alerts')}
      bodyClassName="space-y-4"
    >
      {family && !family.emailEnabled && (
        <Notice tone="warning">
          {t(
            'notifications.emailNotConfigured',
            "Email isn't configured for this deployment — alerts won't actually be delivered (they're only logged on the server).",
          )}
        </Notice>
      )}

      {isLoading ? (
        <div className="space-y-4 py-1" aria-hidden="true">
          {EVENT_KEYS.map((key, i) => (
            <div key={key} className="flex min-h-7 items-center gap-3">
              <Skeleton height={20} width={40} rounded="full" />
              <Skeleton variant="line" height={14} width={`${40 + (i % 4) * 10}%`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="-my-1 divide-y divide-neutral-100 dark:divide-neutral-700">
          {EVENT_KEYS.map((key) => (
            <div key={key} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <Switch
                label={eventLabel(key)}
                checked={instant[key] !== false}
                disabled={savingKey === key}
                onChange={(e) => handleToggle(key, e.target.checked)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end border-t border-neutral-100 pt-4 dark:border-neutral-700">
        <Button variant="secondary" onClick={handleTestEmail} loading={testSending}>
          {t('notifications.sendTestEmail', 'Send test email')}
        </Button>
      </div>
    </SectionCard>
  );
}
