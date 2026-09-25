import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { SectionCard } from '@/components/ui/Card.jsx';
import ChoiceGroup from '@/components/ui/ChoiceGroup.jsx';
import { FIELD_GAP } from '@/components/ui/tokens.js';
import Input from '@/components/ui/Input.jsx';
import Button from '@/components/ui/Button.jsx';
import { familyApi } from '@/services/familyApi.js';
import { SHARE_DURATIONS, durationLabel, familyShareDuration } from '@/features/share/shareStatus.js';

/**
 * Settings > Family tab > family details section — admin only. `PATCH /family` { name, defaultShareDuration }.
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
    <SectionCard id="settings-family" title={t('tabs.family', 'Family')} bodyClassName={FIELD_GAP}>
      <Input label={t('family.familyNameLabel', 'Family name')} value={name} maxLength={150} onChange={(e) => setName(e.target.value)} />
      <ChoiceGroup
        name="default-share-duration"
        label={t('family.shareDurationLabel', 'Default share link duration')}
        hint={t('family.shareDurationHint', 'New share links work for this long. You can pick another time when sharing.')}
        columns={3}
        value={duration}
        onChange={setDuration}
        options={SHARE_DURATIONS.map((value) => ({ value, label: durationLabel(value, t) }))}
      />
      <div className="kb-sticky flex justify-end">
        <Button onClick={handleSave} loading={saving}>
          {t('common:actions.save', 'Save')}
        </Button>
      </div>
    </SectionCard>
  );
}
