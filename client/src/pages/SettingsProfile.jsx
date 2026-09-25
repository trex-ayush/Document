import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Input from '@/components/ui/Input.jsx';
import Button from '@/components/ui/Button.jsx';
import Avatar from '@/components/ui/Avatar.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { authApi } from '@/services/authApi.js';

const AVATAR_COLORS = [
  '#FF5A5F', '#FF9F1C', '#F4A261', '#2EC4B6', '#4CC9F0',
  '#4361EE', '#7209B7', '#F72585', '#38B000', '#8D99AE',
];

/** Settings > Profile tab — `PATCH /auth/me` (name, avatarColor). */
export default function SettingsProfile() {
  const { t } = useTranslation('settings');
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor || AVATAR_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name || '');
    setAvatarColor(user?.avatarColor || AVATAR_COLORS[0]);
  }, [user]);

  const dirty = name.trim() !== (user?.name || '') || avatarColor !== (user?.avatarColor || AVATAR_COLORS[0]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('profile.nameRequired', 'Name is required'));
      return;
    }
    setSaving(true);
    try {
      const updated = await authApi.updateMe({ name: name.trim(), avatarColor });
      updateUser(updated);
      toast.success(t('profile.updated', 'Profile updated'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('profile.updateFailed', 'Could not update your profile.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar user={{ name, avatarColor }} size="xl" />
          <div className="flex-1">
            <Input label={t('profile.nameLabel', 'Name')} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">{t('profile.avatarColorLabel', 'Avatar color')}</p>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t('profile.chooseColor', 'Choose {{color}}', { color: c })}
                onClick={() => setAvatarColor(c)}
                className={`w-11 h-11 rounded-full border-2 transition-transform ${
                  avatarColor === c ? 'border-neutral-900 dark:border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="kb-sticky">
          <Button onClick={handleSave} loading={saving} disabled={!dirty}>
            {t('profile.saveChanges', 'Save changes')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
