import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Lock, Plus, Trash2 } from 'lucide-react';
import Avatar from '@/components/ui/Avatar.jsx';
import Badge from '@/components/ui/Badge.jsx';
import Button from '@/components/ui/Button.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import Input from '@/components/ui/Input.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { PLATFORM_SETTINGS_KEY } from '@/hooks/usePlatformOwner.js';
import { formatDate } from '@/i18n/formatters.js';
import { adminApi } from '@/services/adminApi.js';
import { ErrorBlock, LoadingBlock, Section } from './adminShared.jsx';

const ADMINS_KEY = ['admin', 'admins'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AddAdminDrawer({ isOpen, onClose }) {
  const { t } = useTranslation('admin');
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (saving) return;
    setEmail('');
    setError('');
    onClose();
  };

  const submit = async (e) => {
    e?.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setError(t('admins.errors.invalidEmail', 'Please enter a valid email address.'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminApi.addAdmin(value);
      toast.success(t('admins.toasts.added', '{{email}} is now an admin', { email: value }));
      queryClient.invalidateQueries({ queryKey: ADMINS_KEY });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSaving(false);
      setEmail('');
      onClose();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 400) setError(t('admins.errors.invalidEmail', 'Please enter a valid email address.'));
      else if (status === 409) setError(t('admins.errors.exists', 'This email already has admin rights.'));
      else toast.error(t('admins.toasts.addFailed', 'Could not add this admin. Please try again.'));
      setSaving(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={close}
      side="right"
      size="sm"
      title={t('admins.addDrawer.title', 'Add admin')}
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={close} disabled={saving}>
            {t('admins.addDrawer.cancel', 'Cancel')}
          </Button>
          <Button type="submit" form="add-admin-form" className="min-h-11" loading={saving}>
            {t('admins.addDrawer.submit', 'Add admin')}
          </Button>
        </>
      }
    >
      <form id="add-admin-form" onSubmit={submit} noValidate>
        <Input
          label={t('admins.addDrawer.emailLabel', 'Email address')}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          placeholder={t('admins.addDrawer.placeholder', 'name@example.com')}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError('');
          }}
          error={error || undefined}
          className="min-h-11"
        />
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          {t(
            'admins.addDrawer.note',
            "This person gets admin rights when they sign in with this email. If they don't have an account yet, they get them as soon as they sign up with it.",
          )}
        </p>
      </form>
    </Drawer>
  );
}

/** `/admin/admins` — the super admin (fixed) plus the people who were given admin rights. */
export default function AdminAdmins() {
  const { t } = useTranslation('admin');
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ADMINS_KEY, queryFn: adminApi.listAdmins });
  const myEmail = me?.email?.toLowerCase();
  const isMe = (email) => Boolean(myEmail && email?.toLowerCase() === myEmail);

  const handleRemove = async () => {
    try {
      await adminApi.removeAdmin(removeTarget.id);
      toast.success(t('admins.toasts.removed', '{{email}} is no longer an admin', { email: removeTarget.email }));
      queryClient.invalidateQueries({ queryKey: ADMINS_KEY });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      // Removing yourself: re-read your role so the nav and this area lock straight away.
      if (isMe(removeTarget.email)) queryClient.invalidateQueries({ queryKey: PLATFORM_SETTINGS_KEY });
    } catch {
      toast.error(t('admins.toasts.removeFailed', 'Could not remove this admin. Please try again.'));
    }
  };

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} onRetry={refetch} />;

  const superAdmin = data?.superAdmin;
  const admins = data?.admins || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-neutral-600 dark:text-neutral-400 sm:max-w-xl">
          {t(
            'admins.intro',
            'Admins can see every family and person, turn accounts off and remove share links. Only the super admin can change platform settings.',
          )}
        </p>
        <Button className="min-h-11 shrink-0" onClick={() => setAddOpen(true)} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          {t('admins.add', 'Add admin')}
        </Button>
      </div>

      <Section title={t('admins.listTitle', 'Admins')} bodyClassName="">
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
          {superAdmin && (
            <li className="flex items-center gap-3 px-4 py-3">
              <Avatar user={{ name: superAdmin.name || superAdmin.email }} size="md" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">{superAdmin.name || superAdmin.email}</span>
                  <Badge tone="purple">{t('role.super', 'Super admin')}</Badge>
                  {isMe(superAdmin.email) && <Badge tone="gray">{t('common.you', 'You')}</Badge>}
                </p>
                {superAdmin.name && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{superAdmin.email}</p>}
              </div>
              <Badge tone="gray" className="shrink-0 gap-1">
                <Lock className="h-3 w-3" aria-hidden="true" />
                {t('admins.cantRemove', "Can't be removed")}
              </Badge>
            </li>
          )}

          {admins.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar user={{ name: a.name || a.email }} size="md" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">{a.name || a.email}</span>
                  <Badge tone="blue">{t('role.admin', 'Admin')}</Badge>
                  {isMe(a.email) && <Badge tone="gray">{t('common.you', 'You')}</Badge>}
                </p>
                {a.name && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{a.email}</p>}
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {a.addedBy?.email
                    ? t('admins.addedByOn', 'Added by {{email}} on {{date}}', { email: a.addedBy.email, date: formatDate(a.addedAt) })
                    : t('admins.addedOn', 'Added on {{date}}', { date: formatDate(a.addedAt) })}
                </p>
              </div>
              <Button
                variant="ghost"
                className="min-h-11 shrink-0 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                onClick={() => {
                  setRemoveTarget(a);
                  setRemoveOpen(true);
                }}
                leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              >
                {t('admins.remove', 'Remove')}
              </Button>
            </li>
          ))}
        </ul>
        {admins.length === 0 && (
          <p className="border-t border-neutral-100 px-4 py-4 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            {t('admins.empty', 'No other admins yet. Tap “Add admin” to give someone access.')}
          </p>
        )}
      </Section>

      <AddAdminDrawer isOpen={addOpen} onClose={() => setAddOpen(false)} />

      <ConfirmDrawer
        isOpen={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={handleRemove}
        title={t('admins.removeTitle', 'Remove {{email}} as admin?', { email: removeTarget?.email || '' })}
        description={
          isMe(removeTarget?.email)
            ? t('admins.removeSelfDescription', "You'll lose access to this admin area straight away. Your own account and families stay as they are.")
            : t(
                'admins.removeDescription',
                'They lose access to this admin area straight away. Their own account and families stay as they are.',
              )
        }
        confirmLabel={t('admins.remove', 'Remove')}
      />
    </div>
  );
}
