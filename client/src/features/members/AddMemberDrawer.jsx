import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Drawer from '@/components/ui/Drawer.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import ChoiceGroup from '@/components/ui/ChoiceGroup.jsx';
import { FIELD_GAP } from '@/components/ui/tokens.js';
import { membersApi } from '@/services/membersApi.js';
import InviteSharePanel from './InviteSharePanel.jsx';
import { LEVEL_PAYLOAD, levelOptions } from './accessLevels.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * AddMemberDrawer — "Add member" (`POST /members`): Name + Email, plus their access (view only ·
 * add, edit and share — the default · also invite and manage members, i.e. family admin;
 * changeable later in the member panel). The server always invites the person,
 * emails the invite and returns the link; the drawer then switches to a "Send the invite" step
 * (InviteSharePanel) with Copy / WhatsApp / Share so the admin can send it themselves if email is
 * off or slow. Editing an existing member happens in `MemberPanel`.
 *
 * Props: isOpen, onClose, familyName, onSaved?: () => void.
 */
export default function AddMemberDrawer({ isOpen, onClose, familyName, onSaved }) {
  const { t } = useTranslation(['members', 'common']);
  const [created, setCreated] = useState(null); // { name, email, invite } once added
  const [level, setLevel] = useState('write');

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { name: '', email: '' } });

  useEffect(() => {
    if (!isOpen) return;
    setCreated(null);
    setLevel('write');
    reset({ name: '', email: '' });
  }, [isOpen, reset]);

  const onSubmit = async (data) => {
    try {
      const email = data.email.trim();
      const result = await membersApi.create({ name: data.name.trim(), email, ...LEVEL_PAYLOAD[level] });
      onSaved?.();
      // The next step says whether the email went out, right above the link — no toast on top of it.
      setCreated({ name: result?.name || data.name, email: result?.user?.email || email, invite: result?.invite || null });
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'ALREADY_MEMBER') {
        setError('email', { message: t('form.alreadyMember', 'This person is already in your family (or already invited).') });
      } else if (code === 'EMAIL_TAKEN') {
        setError('email', { message: t('form.emailTaken', 'This email is already in use') });
      } else if (code === 'VALIDATION_ERROR' && err?.response?.data?.details?.fieldErrors?.email) {
        setError('email', { message: t('form.emailInvalid', 'Please enter a correct email address') });
      } else {
        toast.error(err?.response?.data?.message || t('form.toastFailed', 'Could not save this member.'));
      }
    }
  };

  const title = created ? t('invite.title', 'Invite {{name}}', { name: created.name }) : t('form.addTitle', 'Add member');

  const footer = created ? (
    <Button onClick={onClose}>{t('common:actions.done', 'Done')}</Button>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
        {t('common:actions.cancel', 'Cancel')}
      </Button>
      <Button onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
        {t('form.addTitle', 'Add member')}
      </Button>
    </>
  );

  return (
    <Drawer isOpen={isOpen} onClose={onClose} side="right" size="sm" title={title} footer={footer}>
      {created ? (
        created.invite ? (
          <InviteSharePanel name={created.name} email={created.email} familyName={familyName} invite={created.invite} />
        ) : (
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{t('form.toastAdded', 'Member added')}</p>
        )
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className={FIELD_GAP}>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            {t('form.addIntro', "Enter their name and email. We'll email them an invite, and you'll also get a link to send on WhatsApp.")}
          </p>
          <Input
            label={t('form.nameLabel', 'Name')}
            placeholder={t('form.namePlaceholder', 'e.g. Priya Singh')}
            autoComplete="off"
            error={errors.name?.message}
            {...register('name', {
              required: t('form.nameRequired', 'Name is required'),
              validate: (v) => v.trim().length > 0 || t('form.nameRequired', 'Name is required'),
            })}
          />
          <Input
            label={t('form.emailLabel', 'Email')}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            placeholder={t('form.emailPlaceholder', 'them@example.com')}
            error={errors.email?.message}
            {...register('email', {
              required: t('form.emailRequired', 'Email is required'),
              validate: (v) => EMAIL_PATTERN.test(v.trim()) || t('form.emailInvalid', 'Please enter a correct email address'),
            })}
          />
          <ChoiceGroup
            name="new-member-access"
            label={t('form.accessLevelLabel', 'Access level')}
            value={level}
            onChange={setLevel}
            options={levelOptions(t)}
            disabled={isSubmitting}
          />
        </form>
      )}
    </Drawer>
  );
}
