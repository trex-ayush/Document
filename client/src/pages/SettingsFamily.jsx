import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Input from '@/components/ui/Input.jsx';
import Switch from '@/components/ui/Switch.jsx';
import Button from '@/components/ui/Button.jsx';
import { familyApi } from '@/services/familyApi.js';

/** Settings > Family tab — admin only. `PATCH /family` (name, settings.*). */
export default function SettingsFamily({ family }) {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [retentionDays, setRetentionDays] = useState(365);
  const [requireReauth, setRequireReauth] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!family) return;
    setName(family.name || '');
    setRetentionDays(family.settings?.activityRetentionDays ?? 365);
    setRequireReauth(family.settings?.requireReauthForSecrets !== false);
  }, [family]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('family.familyNameRequired', 'Family name is required'));
      return;
    }
    setSaving(true);
    try {
      await familyApi.update({
        name: name.trim(),
        settings: { activityRetentionDays: Number(retentionDays) || 365, requireReauthForSecrets: requireReauth },
      });
      toast.success(t('family.saved', 'Family settings saved'));
      queryClient.invalidateQueries({ queryKey: ['family'] });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('family.saveFailed', 'Could not save family settings.'));
    } finally {
      setSaving(false);
    }
  };

  if (!family) return null;

  return (
    <Card>
      <CardBody className="space-y-4">
        <Input label={t('family.familyNameLabel', 'Family name')} value={name} maxLength={150} onChange={(e) => setName(e.target.value)} />
        <Input
          label={t('family.retentionLabel', 'Activity log retention (days)')}
          type="number"
          min={1}
          value={retentionDays}
          onChange={(e) => setRetentionDays(e.target.value)}
          help={t('family.retentionHelp', 'Activity older than this is automatically pruned.')}
        />
        <Switch
          label={t('family.reauthLabel', 'Require re-authentication for secrets')}
          description={t(
            'family.reauthDescription',
            'Ask for a password (or a fresh Google confirmation) again before revealing a saved password or secret value.',
          )}
          checked={requireReauth}
          onChange={(e) => setRequireReauth(e.target.checked)}
        />
        <Button onClick={handleSave} loading={saving}>
          {t('common:actions.save', 'Save')}
        </Button>
      </CardBody>
    </Card>
  );
}
