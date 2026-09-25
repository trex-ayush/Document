import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Input from '@/components/ui/Input.jsx';
import FormField from '@/components/ui/FormField.jsx';
import Button from '@/components/ui/Button.jsx';
import { familyApi } from '@/services/familyApi.js';
import { SHARE_DURATIONS, durationLabel, familyShareDuration } from '@/features/share/shareStatus.js';

/**
 * Settings > Family tab — admin only. `PATCH /family` { name, defaultShareDuration }.
 * The default duration is what the Share dialog preselects; anyone sharing can still pick
 * another option for a single link.
 */
export default function SettingsFamily({ family }) {
  const { t } = useTranslation(['settings', 'shares', 'common']);
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(familyShareDuration(null));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!family) return;
    setName(family.name || '');
    setDuration(familyShareDuration(family));
  }, [family]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('family.familyNameRequired', 'Family name is required'));
      return;
    }
    setSaving(true);
    try {
      await familyApi.update({ name: name.trim(), defaultShareDuration: duration });
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
        <FormField
          label={t('family.shareDurationLabel', 'Default share link duration')}
          htmlFor="default-share-duration"
          hint={t('family.shareDurationHint', 'New share links work for this long. You can pick another time when sharing.')}
        >
          <select
            id="default-share-duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          >
            {SHARE_DURATIONS.map((value) => (
              <option key={value} value={value}>{durationLabel(value, t)}</option>
            ))}
          </select>
        </FormField>
        <div className="kb-sticky">
          <Button onClick={handleSave} loading={saving}>
            {t('common:actions.save', 'Save')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
