import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Input from '@/components/ui/Input.jsx';
import Switch from '@/components/ui/Switch.jsx';
import Button from '@/components/ui/Button.jsx';
import { familyApi } from '@/services/familyApi.js';

/**
 * Settings > Family tab — admin only. `PATCH /family` (name, settings.requireReauthForSecrets).
 * Activity retention and the upload/storage limits are platform-admin-only (`/platform-settings`).
 */
export default function SettingsFamily({ family }) {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [requireReauth, setRequireReauth] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!family) return;
    setName(family.name || '');
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
        settings: { requireReauthForSecrets: requireReauth },
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
