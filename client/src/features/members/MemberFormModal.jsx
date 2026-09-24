import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Switch from '@/components/ui/Switch.jsx';
import FormField from '@/components/ui/FormField.jsx';
import { membersApi } from '@/services/membersApi.js';
import { env } from '@/config/env.js';

function useAccessOptions(t) {
  return [
    { value: 'read', label: t('form.accessRead', 'Read only — can view & download') },
    { value: 'write', label: t('form.accessWrite', 'Read & write — can also add/edit/delete') },
  ];
}

/**
 * MemberFormModal — add or edit a Membership. Two very different shapes
 * (docs/API.md "POST /members" vs "PATCH /members/:id") drive two render
 * paths rather than one shared schema:
 *
 *  - **Create**: profile-only vs login-enabled toggle; when login-enabled,
 *    a sign-in method (password/google/both — google options hidden when
 *    `VITE_GOOGLE_CLIENT_ID` is unset, since Google sign-in is disabled
 *    entirely then), a "send invite email" checkbox (default =
 *    `family.emailEnabled`, forced off when email is disabled), and a
 *    temp-password field shown only as the fallback when no invite will be
 *    sent.
 *  - **Edit**: name/relation/dob/access(if canLogin)/status only — email,
 *    canLogin and loginMethod are fixed at creation time per the API, so
 *    this mode never shows them.
 *
 * Props: isOpen, onClose, member? (Membership — presence = edit mode),
 * emailEnabled (Family.emailEnabled, for the invite-checkbox default),
 * onSaved?: () => void.
 */
export default function MemberFormModal({ isOpen, onClose, member, emailEnabled, onSaved }) {
  const { t } = useTranslation('members');
  const ACCESS_OPTIONS = useAccessOptions(t);
  const isEdit = !!member;
  const [canLogin, setCanLogin] = useState(true);
  const [loginMethod, setLoginMethod] = useState('password');
  const [sendInvite, setSendInvite] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { name: '', relation: '', dob: '', email: '', tempPassword: '', access: 'read', status: 'active' },
  });

  useEffect(() => {
    if (!isOpen) return;
    if (isEdit) {
      reset({
        name: member.name || '',
        relation: member.relation || '',
        dob: member.dob ? String(member.dob).slice(0, 10) : '',
        access: member.access || 'read',
        status: member.status === 'disabled' ? 'disabled' : 'active',
        email: '',
        tempPassword: '',
      });
      setCanLogin(!!member.canLogin);
    } else {
      reset({ name: '', relation: '', dob: '', email: '', tempPassword: '', access: 'read', status: 'active' });
      setCanLogin(true);
      setLoginMethod('password');
      setSendInvite(!!emailEnabled);
    }
  }, [isOpen, isEdit, member, emailEnabled, reset]);

  const onSubmit = async (data) => {
    try {
      if (isEdit) {
        const payload = { name: data.name, relation: data.relation, status: data.status };
        if (member.canLogin) payload.access = data.access;
        if (data.dob) payload.dob = data.dob;
        await membersApi.update(member.id, payload);
        toast.success(t('form.toastUpdated', 'Member updated'));
      } else if (!canLogin) {
        await membersApi.create({ name: data.name, relation: data.relation, dob: data.dob || undefined, canLogin: false });
        toast.success(t('form.toastAdded', 'Member added'));
      } else {
        if (!data.email) {
          setError('email', { message: t('form.emailRequired', 'Email is required') });
          return;
        }
        const effectiveSendInvite = emailEnabled ? sendInvite : false;
        const needsTempPassword = !effectiveSendInvite && loginMethod !== 'google';
        if (needsTempPassword && !data.tempPassword) {
          setError('tempPassword', { message: t('form.tempPasswordRequired', 'Set a temporary password, or turn on "Send invite email"') });
          return;
        }
        const payload = {
          name: data.name,
          relation: data.relation,
          dob: data.dob || undefined,
          email: data.email,
          access: data.access,
          loginMethod,
          sendInvite: effectiveSendInvite,
        };
        if (needsTempPassword) payload.tempPassword = data.tempPassword;
        await membersApi.create(payload);
        toast.success(effectiveSendInvite ? t('form.toastInviteSent', 'Invite sent') : t('form.toastAdded', 'Member added'));
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'EMAIL_TAKEN') {
        setError('email', { message: t('form.emailTaken', 'This email is already in use') });
      } else {
        toast.error(err?.response?.data?.message || t('form.toastFailed', 'Could not save this member.'));
      }
    }
  };

  const effectiveSendInvite = emailEnabled ? sendInvite : false;
  const showTempPassword = !isEdit && canLogin && !effectiveSendInvite && loginMethod !== 'google';
  const showGoogleOptions = !!env.googleClientId;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? t('form.editTitle', 'Edit member') : t('form.addTitle', 'Add member')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
            {isEdit ? t('form.saveChanges', 'Save changes') : t('form.addTitle', 'Add member')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input label={t('form.nameLabel', 'Name')} placeholder={t('form.namePlaceholder', 'e.g. Priya Singh')} error={errors.name?.message} {...register('name', { required: t('form.nameRequired', 'Name is required') })} />
        <Input label={t('form.relationLabel', 'Relation')} placeholder={t('form.relationPlaceholder', 'e.g. Spouse, Child, Parent')} {...register('relation')} />
        <Input label={t('form.dobLabel', 'Date of birth (optional)')} type="date" {...register('dob')} />

        {isEdit ? (
          <>
            {member.canLogin && (
              <FormField label={t('form.accessLevelLabel', 'Access level')}>
                <select className="w-full min-h-[44px] rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3" {...register('access')}>
                  {ACCESS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField label={t('form.statusLabel', 'Status')}>
              <select className="w-full min-h-[44px] rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3" {...register('status')}>
                <option value="active">{t('common:status.active', 'Active')}</option>
                <option value="disabled">{t('common:status.disabled', 'Disabled')}</option>
              </select>
            </FormField>
          </>
        ) : (
          <>
            <Switch
              label={t('form.canLoginLabel', 'This person can sign in')}
              description={t('form.canLoginDescription', 'Off creates a profile-only record (e.g. a child or pet) with no login.')}
              checked={canLogin}
              onChange={(e) => setCanLogin(e.target.checked)}
            />

            {canLogin && (
              <div className="space-y-4 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
                <Input label={t('form.emailLabel', 'Email')} type="email" placeholder={t('form.emailPlaceholder', 'them@example.com')} error={errors.email?.message} {...register('email')} />

                <FormField label={t('form.signInMethodLabel', 'Sign-in method')}>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" className="accent-primary-500" checked={loginMethod === 'password'} onChange={() => setLoginMethod('password')} />
                      {t('form.methodPassword', 'Password')}
                    </label>
                    {showGoogleOptions && (
                      <>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="radio" className="accent-primary-500" checked={loginMethod === 'google'} onChange={() => setLoginMethod('google')} />
                          {t('form.methodGoogleOnly', 'Google only')}
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="radio" className="accent-primary-500" checked={loginMethod === 'both'} onChange={() => setLoginMethod('both')} />
                          {t('form.methodPasswordOrGoogle', 'Password or Google')}
                        </label>
                      </>
                    )}
                  </div>
                </FormField>

                <FormField label={t('form.accessLevelLabel', 'Access level')}>
                  <select className="w-full min-h-[44px] rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3" {...register('access')}>
                    {ACCESS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <Switch
                  label={t('form.sendInviteLabel', 'Send invite email')}
                  description={
                    emailEnabled
                      ? t('form.sendInviteDescriptionEnabled', 'They set their own password by accepting the emailed invite.')
                      : t('form.sendInviteDescriptionDisabled', 'Email is not configured for this family — set a temporary password below instead.')
                  }
                  checked={effectiveSendInvite}
                  disabled={!emailEnabled}
                  onChange={(e) => setSendInvite(e.target.checked)}
                />

                {showTempPassword && (
                  <Input
                    label={t('form.tempPasswordLabel', 'Temporary password')}
                    type="text"
                    placeholder={t('form.tempPasswordPlaceholder', 'At least 8 characters')}
                    error={errors.tempPassword?.message}
                    {...register('tempPassword')}
                  />
                )}
              </div>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
