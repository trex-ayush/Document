import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Input from '@/components/ui/Input.jsx';
import Switch from '@/components/ui/Switch.jsx';
import Button from '@/components/ui/Button.jsx';
import { familyApi } from '@/services/familyApi.js';

/** Settings > Family tab — admin only. `PATCH /family` (name, settings.*). */
export default function SettingsFamily({ family }) {
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
      toast.error('Family name is required');
      return;
    }
    setSaving(true);
    try {
      await familyApi.update({
        name: name.trim(),
        settings: { activityRetentionDays: Number(retentionDays) || 365, requireReauthForSecrets: requireReauth },
      });
      toast.success('Family settings saved');
      queryClient.invalidateQueries({ queryKey: ['family'] });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save family settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!family) return null;

  return (
    <Card>
      <CardBody className="space-y-4">
        <Input label="Family name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Activity log retention (days)"
          type="number"
          min={1}
          value={retentionDays}
          onChange={(e) => setRetentionDays(e.target.value)}
          help="Activity older than this is automatically pruned."
        />
        <Switch
          label="Require re-authentication for secrets"
          description="Ask for a password (or a fresh Google confirmation) again before revealing a saved password or secret value."
          checked={requireReauth}
          onChange={(e) => setRequireReauth(e.target.checked)}
        />
        <Button onClick={handleSave} loading={saving}>
          Save
        </Button>
      </CardBody>
    </Card>
  );
}
