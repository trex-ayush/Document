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
import { ListCard, ListRow } from '@/components/ui/ListRow.jsx';
import { ErrorBlock, LoadingBlock } from './adminShared.jsx';

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
          <Button variant="secondary" onClick={close} disabled={saving}>
            {t('admins.addDrawer.cancel', 'Cancel')}
          </Button>
          <Button type="submit" form="add-admin-form" loading={saving}>
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

  if (error) return <ErrorBlock error={error} onRetry={refetch} />;

  const superAdmin = data?.superAdmin;
  const admins = data?.admins || [];
  const nameLine = (person, badge) => (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="truncate">{person.name || person.email}</span>
      {badge}
      {isMe(person.email) && <Badge tone="gray">{t('common.you', 'You')}</Badge>}
    </span>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500 sm:max-w-xl dark:text-neutral-400">
          {t(
            'admins.intro',
            'Admins can see every family and person, turn accounts off and remove share links. Only the super admin can change platform settings.',
          )}
        </p>
        <Button className="shrink-0" onClick={() => setAddOpen(true)} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          {t('admins.add', 'Add admin')}
        </Button>
      </div>

      {isLoading ? (
        <LoadingBlock rows={3} />
      ) : (
        <ListCard as="ul" columns aria-label={t('admins.listTitle', 'Admins')}>
          {superAdmin && (
            <ListRow
              as="li"
              icon={<Avatar user={{ name: superAdmin.name || superAdmin.email }} size="md" />}
              title={nameLine(superAdmin, <Badge tone="purple">{t('role.super', 'Super admin')}</Badge>)}
              meta={superAdmin.name ? superAdmin.email : null}
              actions={
                <Badge tone="gray" className="gap-1">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('admins.cantRemove', "Can't be removed")}</span>
                </Badge>
              }
            />
          )}

          {admins.map((a) => (
            <ListRow
              key={a.id}
              as="li"
              icon={<Avatar user={{ name: a.name || a.email }} size="md" />}
              title={nameLine(a, <Badge tone="blue">{t('role.admin', 'Admin')}</Badge>)}
              meta={[a.name ? a.email : null,
                a.addedBy?.email
                  ? t('admins.addedByOn', 'Added by {{email}} on {{date}}', { email: a.addedBy.email, date: formatDate(a.addedAt) })
                  : t('admins.addedOn', 'Added on {{date}}', { date: formatDate(a.addedAt) })]
                .filter(Boolean)
                .join(' · ')}
              actions={
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={() => {
                    setRemoveTarget(a);
                    setRemoveOpen(true);
                  }}
                  leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                >
                  <span className="hidden sm:inline">{t('admins.remove', 'Remove')}</span>
                  <span className="sr-only sm:hidden">{t('admins.remove', 'Remove')}</span>
                </Button>
              }
            />
          ))}

          {admins.length === 0 && (
            <li className="px-4 py-4 text-sm text-neutral-500 sm:px-5 dark:text-neutral-400">
              {t('admins.empty', 'No other admins yet. Tap “Add admin” to give someone access.')}
            </li>
          )}
        </ListCard>
      )}

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
