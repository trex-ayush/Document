import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import FormField from '@/components/ui/FormField.jsx';
import { membersApi } from '@/services/membersApi.js';
import InviteSharePanel from './InviteSharePanel.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SELECT_CLASS = 'w-full min-h-[48px] rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3';

function useAccessOptions(t) {
  return [
    { value: 'read', label: t('form.accessRead', 'Read only — can view & download') },
    { value: 'write', label: t('form.accessWrite', 'Read & write — can also add/edit/delete') },
  ];
}

/**
 * MemberFormModal — add or edit a Membership (docs/API.md "POST /members" /
 * "PATCH /members/:id").
 *
 *  - **Add**: just Name + Email. The server always invites the person
 *    (read-only access by default, changeable later via Edit), emails the
 *    invite, and returns the link — the modal then switches to a "Send the
 *    invite" step (InviteSharePanel) with Copy / WhatsApp / Share so the
 *    admin can send it themselves if email is off or slow.
 *  - **Edit**: name / relation / date of birth / access (if they can sign
 *    in) / status. Status is hidden for a still-pending invite — "active"
 *    only happens when the person actually joins.
 *
 * Props: isOpen, onClose, member? (presence = edit mode), familyName,
 * onSaved?: () => void.
 */
export default function MemberFormModal({ isOpen, onClose, member, familyName, onSaved }) {
  const { t } = useTranslation(['members', 'common']);
  const ACCESS_OPTIONS = useAccessOptions(t);
  const isEdit = !!member;
  const isPending = member?.status === 'invited';
  const [created, setCreated] = useState(null); // { name, email, invite } once added

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { name: '', email: '', relation: '', dob: '', access: 'read', status: 'active' },
  });

  useEffect(() => {
    if (!isOpen) return;
    setCreated(null);
    if (isEdit) {
      reset({
        name: member.name || '',
        email: '',
        relation: member.relation || '',
        dob: member.dob ? String(member.dob).slice(0, 10) : '',
        access: member.access || 'read',
        status: member.status === 'disabled' ? 'disabled' : 'active',
      });
    } else {
      reset({ name: '', email: '', relation: '', dob: '', access: 'read', status: 'active' });
    }
  }, [isOpen, isEdit, member, reset]);

  const onSubmit = async (data) => {
    try {
      if (isEdit) {
        const payload = { name: data.name, relation: data.relation };
        if (!isPending) payload.status = data.status;
        if (member.canLogin) payload.access = data.access;
        if (data.dob) payload.dob = data.dob;
        await membersApi.update(member.id, payload);
        toast.success(t('form.toastUpdated', 'Member updated'));
        onSaved?.();
        onClose?.();
        return;
      }

      const email = data.email.trim();
      const result = await membersApi.create({ name: data.name.trim(), email });
      onSaved?.();
      if (result?.invite?.emailSent) {
        toast.success(t('invite.toastEmailSent', 'Invite sent to {{email}}', { email: result.user?.email || email }));
      } else {
        toast(t('invite.toastEmailNotSent', "Email couldn't be sent — copy the link below and send it yourself."), { duration: 6000 });
      }
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

  const showShareStep = !isEdit && !!created;

  let title = t('form.addTitle', 'Add member');
  if (isEdit) title = t('form.editTitle', 'Edit member');
  else if (showShareStep) title = t('invite.titleAdded', '{{name}} added — send the invite', { name: created.name });

  const footer = showShareStep ? (
    <Button block size="lg" className="min-h-[48px]" onClick={onClose}>
      {t('common:actions.done', 'Done')}
    </Button>
  ) : (
    <>
      <Button variant="ghost" size="lg" className="min-h-[48px]" onClick={onClose} disabled={isSubmitting}>
        {t('common:actions.cancel', 'Cancel')}
      </Button>
      <Button size="lg" className="min-h-[48px] flex-1 sm:flex-none" onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
        {isEdit ? t('form.saveChanges', 'Save changes') : t('form.addTitle', 'Add member')}
      </Button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md" footer={footer}>
      {showShareStep ? (
        created.invite ? (
          <InviteSharePanel name={created.name} email={created.email} familyName={familyName} invite={created.invite} />
        ) : (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('form.toastAdded', 'Member added')}</p>
        )
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {!isEdit && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t('form.addIntro', "Enter their name and email. We'll email them an invite, and you'll also get a link to send on WhatsApp.")}
            </p>
          )}

          <Input
            label={t('form.nameLabel', 'Name')}
            placeholder={t('form.namePlaceholder', 'e.g. Priya Singh')}
            autoComplete="off"
            className="min-h-[48px] !text-base"
            error={errors.name?.message}
            {...register('name', {
              required: t('form.nameRequired', 'Name is required'),
              validate: (v) => v.trim().length > 0 || t('form.nameRequired', 'Name is required'),
            })}
          />

          {!isEdit && (
            <Input
              label={t('form.emailLabel', 'Email')}
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              placeholder={t('form.emailPlaceholder', 'them@example.com')}
              className="min-h-[48px] !text-base"
              error={errors.email?.message}
              {...register('email', {
                required: t('form.emailRequired', 'Email is required'),
                validate: (v) => EMAIL_PATTERN.test(v.trim()) || t('form.emailInvalid', 'Please enter a correct email address'),
              })}
            />
          )}

          {isEdit && (
            <>
              <Input label={t('form.relationLabel', 'Relation')} placeholder={t('form.relationPlaceholder', 'e.g. Spouse, Child, Parent')} className="min-h-[48px]" {...register('relation')} />
              <Input label={t('form.dobLabel', 'Date of birth (optional)')} type="date" className="min-h-[48px]" {...register('dob')} />
              {member.canLogin && (
                <FormField label={t('form.accessLevelLabel', 'Access level')}>
                  <select className={SELECT_CLASS} {...register('access')}>
                    {ACCESS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              {!isPending && (
                <FormField label={t('form.statusLabel', 'Status')}>
                  <select className={SELECT_CLASS} {...register('status')}>
                    <option value="active">{t('common:status.active', 'Active')}</option>
                    <option value="disabled">{t('common:status.disabled', 'Disabled')}</option>
                  </select>
                </FormField>
              )}
            </>
          )}
        </form>
      )}
    </Modal>
  );
}
