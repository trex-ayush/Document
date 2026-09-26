import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ChevronRight, UserRound } from 'lucide-react';
import Avatar from '@/components/ui/Avatar.jsx';
import Badge from '@/components/ui/Badge.jsx';
import Button from '@/components/ui/Button.jsx';
import Tooltip from '@/components/ui/Tooltip.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { ListCard, ListRow } from '@/components/ui/ListRow.jsx';
import FilterBar from '@/components/ui/FilterBar.jsx';
import Table from '@/components/ui/Table.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { Notice } from '@/components/ui/PageState.jsx';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { formatDate, formatRelativeTime } from '@/i18n/formatters.js';
import { adminApi } from '@/services/adminApi.js';
import {
  AdminActivityList,
  DetailRow,
  DrawerHeading,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  UserBadges,
  isForbidden,
} from './adminShared.jsx';

const LIMIT = 20;

function familiesLabel(user, t) {
  const n = user.families?.length || 0;
  if (n === 0) return t('users.noFamilies', 'No family');
  return t('users.familiesCount', { count: n, defaultValue: n === 1 ? '{{count}} family' : '{{count}} families' });
}

function lastLoginLabel(user, t) {
  return user.lastLoginAt
    ? t('users.lastLogin', 'Last sign-in {{when}}', { when: formatRelativeTime(user.lastLoginAt) })
    : t('users.neverSignedIn', 'Never signed in');
}

/** The person being looked at can't be changed: the super admin, or yourself. */
function protectionReason(user, me, t) {
  if (!user) return null;
  if (user.isSuperAdmin) return t('users.detail.protectedSuper', "The super admin's account can't be changed here.");
  const isSelf = (me?.id && user.id === me.id) || (me?.email && user.email?.toLowerCase() === me.email.toLowerCase());
  if (isSelf) return t('users.detail.protectedSelf', "You can't change your own account from here.");
  return null;
}

function UserDrawer({ userId, onClose }) {
  const { t } = useTranslation('admin');
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  // Which confirmation, kept after closing so the text doesn't blank out while it slides away.
  const [confirm, setConfirmKind] = useState(null); // 'disable' | 'enable' | 'logout'
  const [confirmOpen, setConfirmOpen] = useState(false);
  const setConfirm = (kind) => {
    if (kind) setConfirmKind(kind);
    setConfirmOpen(Boolean(kind));
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => adminApi.getUser(userId),
    enabled: Boolean(userId),
  });
  const user = data?.user;
  const name = user?.name || user?.email || '';
  const locked = protectionReason(user, me, t);
  const isSelf = Boolean(user && me && (user.id === me.id || user.email?.toLowerCase() === me.email?.toLowerCase()));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
  };

  const failToast = (err) =>
    toast.error(
      isForbidden(err)
        ? t('users.toasts.forbidden', "You're not allowed to change this account.")
        : t('users.toasts.failed', 'Could not do that. Please try again.'),
    );

  const setDisabled = async (disabled) => {
    try {
      const updated = await adminApi.updateUser(userId, { disabled });
      if (updated && typeof updated === 'object') {
        queryClient.setQueryData(['admin', 'user', userId], (old) => (old ? { ...old, user: { ...old.user, ...updated } } : old));
      }
      toast.success(
        disabled
          ? t('users.toasts.disabled', '{{name}} can no longer sign in', { name })
          : t('users.toasts.enabled', '{{name}} can sign in again', { name }),
      );
      refresh();
    } catch (err) {
      failToast(err);
    }
  };

  const logoutEverywhere = async () => {
    try {
      const res = await adminApi.logoutUserEverywhere(userId);
      const count = Number(res?.revoked) || 0;
      toast.success(t('users.toasts.loggedOut', { count, defaultValue: count === 1 ? 'Signed out of {{count}} device' : 'Signed out of {{count}} devices' }));
      refresh();
    } catch (err) {
      failToast(err);
    }
  };

  const footer =
    user && !locked ? (
      <>
        <Tooltip content={t('tip.logoutAll', 'Sign them out on every phone and computer')}>
          <Button variant="secondary" onClick={() => setConfirm('logout')}>
            {t('users.detail.logoutAll', 'Log out everywhere')}
          </Button>
        </Tooltip>
        {user.disabled ? (
          <Tooltip content={t('tip.enableUser', 'Let them sign in again')}>
            <Button variant="primary" onClick={() => setConfirm('enable')}>
              {t('users.detail.enable', 'Enable account')}
            </Button>
          </Tooltip>
        ) : (
          <Tooltip content={t('tip.disableUser', 'Stop them from signing in')}>
            <Button variant="danger" onClick={() => setConfirm('disable')}>
              {t('users.detail.disable', 'Disable account')}
            </Button>
          </Tooltip>
        )}
      </>
    ) : null;

  const CONFIRMS = {
    disable: {
      title: t('users.confirm.disableTitle', 'Disable {{name}}?', { name }),
      description: t(
        'users.confirm.disableDescription',
        "They won't be able to sign in until you enable the account again. Their families and documents stay as they are.",
      ),
      confirmLabel: t('users.confirm.disableConfirm', 'Disable'),
      variant: 'danger',
      run: () => setDisabled(true),
    },
    enable: {
      title: t('users.confirm.enableTitle', 'Enable {{name}}?', { name }),
      description: t('users.confirm.enableDescription', "They'll be able to sign in again."),
      confirmLabel: t('users.confirm.enableConfirm', 'Enable'),
      variant: 'primary',
      run: () => setDisabled(false),
    },
    logout: {
      title: t('users.confirm.logoutTitle', 'Log {{name}} out everywhere?', { name }),
      description: t(
        'users.confirm.logoutDescription',
        "They'll be signed out on every phone and computer and will need to sign in again.",
      ),
      confirmLabel: t('users.confirm.logoutConfirm', 'Log out everywhere'),
      variant: 'danger',
      run: logoutEverywhere,
    },
  };
  const c = confirm ? CONFIRMS[confirm] : null;

  return (
    <>
      <Drawer isOpen={Boolean(userId)} onClose={onClose} side="right" size="md" title={t('users.detail.title', 'Person details')} footer={footer}>
        {isLoading ? (
          <LoadingBlock rows={4} />
        ) : error ? (
          <ErrorBlock error={error} onRetry={refetch} />
        ) : user ? (
          <div>
            <div className="flex items-center gap-3">
              <Avatar user={{ name }} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">{user.name || user.email}</p>
                <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{user.email}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <UserBadges user={user} isSelf={isSelf} />
                  {!user.disabled && <Badge tone="green">{t('users.badges.active', 'Active')}</Badge>}
                </div>
              </div>
            </div>

            {locked && (
              <Notice className="mt-4">{locked}</Notice>
            )}

            <dl className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-700">
              <DetailRow label={t('users.detail.joined', 'Joined')}>{formatDate(user.createdAt)}</DetailRow>
              <DetailRow label={t('users.detail.lastLogin', 'Last sign-in')}>
                {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : t('users.neverSignedIn', 'Never signed in')}
              </DetailRow>
              <DetailRow label={t('users.detail.signInWith', 'Signs in with')}>
                {(user.authProviders || []).length
                  ? user.authProviders.map((p) => t(`users.providers.${p}`, p)).join(', ')
                  : '—'}
              </DetailRow>
              <DetailRow label={t('users.detail.sessions', 'Signed in on')}>
                {t('users.detail.sessionsCount', {
                  count: Number(data?.activeSessions) || 0,
                  defaultValue: Number(data?.activeSessions) === 1 ? '{{count}} device' : '{{count}} devices',
                })}
              </DetailRow>
            </dl>

            <DrawerHeading>{t('users.detail.families', 'Families')}</DrawerHeading>
            {user.families?.length ? (
              <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
                {user.families.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-neutral-800 dark:text-neutral-200">{f.name}</span>
                    <span className="flex shrink-0 gap-1.5">
                      <Badge tone={f.role === 'admin' ? 'purple' : 'gray'}>{t(`roles.${f.role}`, f.role || '')}</Badge>
                      {f.access && <Badge tone="blue">{t(`access.${f.access}`, f.access)}</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('users.detail.noFamilies', 'Not in any family')}</p>
            )}

            <DrawerHeading>{t('users.detail.recentActivity', 'Recent activity')}</DrawerHeading>
            <AdminActivityList items={data?.recentActivity} />
          </div>
        ) : null}
      </Drawer>

      <ConfirmDrawer
        isOpen={confirmOpen && Boolean(c)}
        onClose={() => setConfirm(null)}
        onConfirm={c?.run}
        title={c?.title}
        description={c?.description}
        confirmLabel={c?.confirmLabel}
        confirmVariant={c?.variant}
      />
    </>
  );
}

/** `/admin/users` — every person on this deployment, searchable, with a details drawer. */
export default function AdminUsers() {
  const { t } = useTranslation('admin');
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(LIMIT);
  const [openId, setOpenId] = useState(null);
  const debouncedQ = useDebouncedValue(q.trim(), 300);

  useEffect(() => setPage(1), [debouncedQ, status, limit]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'users', { q: debouncedQ, status, page, limit }],
    queryFn: () => adminApi.listUsers({ q: debouncedQ, status, page, limit }),
    placeholderData: keepPreviousData,
  });
  const items = data?.items || [];
  const isSelf = (u) => Boolean(me && (u.id === me.id || u.email?.toLowerCase() === me.email?.toLowerCase()));

  const nameCell = (u) => (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar user={{ name: u.name || u.email }} size="sm" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{u.name || u.email}</span>
          <UserBadges user={u} isSelf={isSelf(u)} />
        </p>
        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{u.email}</p>
      </div>
    </div>
  );

  const columns = [
    { key: 'name', label: t('users.columns.name', 'Name'), render: nameCell },
    { key: 'families', label: t('users.columns.families', 'Families'), render: (u) => familiesLabel(u, t) },
    {
      key: 'lastLoginAt',
      label: t('users.columns.lastLogin', 'Last sign-in'),
      render: (u) => (u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : t('users.never', 'Never')),
    },
    { key: 'createdAt', label: t('users.columns.joined', 'Joined'), render: (u) => formatDate(u.createdAt) },
  ];

  return (
    <div>
      <FilterBar
        className="mb-4 sm:mb-6"
        search={q}
        onSearchChange={setQ}
        searchPlaceholder={t('users.searchPlaceholder', 'Search by name or email')}
        values={{ status }}
        onChange={(next) => setStatus(next.status)}
        filters={[
          {
            key: 'status',
            label: t('users.statusLabel', 'Show'),
            type: 'segment',
            empty: 'all',
            options: [
              { value: 'all', label: t('users.status.all', 'All'), tip: t('tip.usersAll', 'Everyone') },
              { value: 'active', label: t('users.status.active', 'Active'), tip: t('tip.usersActive', 'People who can sign in') },
              { value: 'disabled', label: t('users.status.disabled', 'Disabled'), tip: t('tip.usersDisabled', 'People who cannot sign in') },
            ],
          },
        ]}
      />

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon={<UserRound />} title={t('users.empty', 'No people found')} />
      ) : (
        <>
          {/* Phones and tablets: the app's list rows; tap one for details. */}
          <ListCard as="ul" className="lg:hidden">
            {items.map((u) => (
              <ListRow
                key={u.id}
                as="li"
                onClick={() => setOpenId(u.id)}
                tip={t('tip.openUser', 'See their details')}
                icon={<Avatar user={{ name: u.name || u.email }} size="md" />}
                title={
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="truncate">{u.name || u.email}</span>
                    <UserBadges user={u} isSelf={isSelf(u)} />
                  </span>
                }
                meta={`${familiesLabel(u, t)} · ${lastLoginLabel(u, t)}`}
                actions={<ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden="true" />}
              />
            ))}
          </ListCard>

          {/* Desktop: a table; click a row for details. */}
          <div className="hidden lg:block">
            <Table
              columns={columns}
              rows={items}
              rowKey={(u) => u.id}
              onRowClick={(u) => setOpenId(u.id)}
              compact
              className="rounded-xl"
            />
          </div>
        </>
      )}

      <Pagination page={page} limit={limit} total={data?.total} onPageChange={setPage} onLimitChange={setLimit} disabled={isFetching} />

      <UserDrawer userId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
