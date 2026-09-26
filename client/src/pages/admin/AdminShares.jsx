import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Ban, Clock, FileText, Folder, Link2, List, Lock, Share2 } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import Badge from '@/components/ui/Badge.jsx';
import Table from '@/components/ui/Table.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmModal from '@/components/ui/ConfirmModal.jsx';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs.jsx';
import { ListCard, ListIcon, ListRow } from '@/components/ui/ListRow.jsx';
import { ErrorState, LoadingState } from '@/components/ui/PageState.jsx';
import { shareStatusOf } from '@/features/share/shareStatus.js';
import { formatDateTime, formatRelativeTime } from '@/i18n/formatters.js';
import { adminOpsApi } from '@/services/adminOpsApi.js';

const STATUSES = ['active', 'expired', 'revoked', 'all'];
const PAGE_SIZE = 20;
const STATUS_TONE = { active: 'green', expired: 'gray', revoked: 'red' };
const STATUS_ICON = { active: Link2, expired: Clock, revoked: Ban, all: List };

/**
 * Admin > Shares (`/admin/shares`) — every share link across every family, `GET /admin/shares`
 * (docs/ADMIN_API.md): what it shares, which family, who made it, when it expires, how often it
 * was opened, and a Revoke button (`POST /admin/shares/:id/revoke`) behind a confirm drawer.
 * The API never returns a link's token or URL, and this page never tries to show or rebuild one.
 * Cards on phones, a table on PC.
 */
export default function AdminShares() {
  const { t } = useTranslation(['adminOps', 'common']);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('active');
  const [revoking, setRevoking] = useState(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey: ['admin-ops', 'shares', status],
    queryFn: ({ pageParam }) => adminOpsApi.shares({ status, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const page = Number(last?.page) || 1;
      const limit = Number(last?.limit) || PAGE_SIZE;
      return page * limit < (Number(last?.total) || 0) ? page + 1 : undefined;
    },
  });
  const shares = data?.pages.flatMap((p) => p.items || []) || [];
  const total = data?.pages[0]?.total;

  const handleRevoke = async () => {
    try {
      await adminOpsApi.revokeShare(revoking.id);
      toast.success(t('shares.revoked', 'Link turned off'));
      queryClient.invalidateQueries({ queryKey: ['admin-ops', 'shares'] });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('shares.revokeFailed', 'Could not turn off this link.'));
    }
  };

  const statusLabel = (value) =>
    t(`shares.status.${value}`, { active: 'Active', expired: 'Expired', revoked: 'Turned off', all: 'All' }[value]);

  const columns = [
    {
      key: 'target',
      label: t('shares.columns.link', 'Shared item'),
      render: (s) => <TargetCell share={s} />,
    },
    { key: 'family', label: t('shares.columns.family', 'Family'), render: (s) => s.family?.name || '—' },
    {
      key: 'createdBy',
      label: t('shares.columns.createdBy', 'Made by'),
      render: (s) => (
        <span title={s.createdBy?.email || undefined}>
          {s.createdBy?.name || s.createdBy?.email || '—'}
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">{formatRelativeTime(s.createdAt)}</span>
        </span>
      ),
    },
    {
      key: 'expiry',
      label: t('shares.columns.expiry', 'Expiry'),
      render: (s) => <ExpiryText share={s} />,
    },
    { key: 'opens', label: t('shares.columns.opens', 'Opens'), align: 'right', render: (s) => <OpensText share={s} short /> },
    {
      key: 'actions',
      label: <span className="sr-only">{t('shares.columns.actions', 'Actions')}</span>,
      align: 'right',
      render: (s) => <RevokeButton share={s} onRevoke={setRevoking} />,
    },
  ];

  let body;
  if (isLoading) {
    body = <LoadingState />;
  } else if (isError) {
    body = <ErrorState>{t('shares.loadError', 'Could not load share links.')}</ErrorState>;
  } else if (shares.length === 0) {
    body = (
      <EmptyState
        icon={<Share2 strokeWidth={1.5} />}
        title={t(`shares.empty.${status}`, {
          active: 'No active links',
          expired: 'No expired links',
          revoked: 'No turned-off links',
          all: 'No share links yet',
        }[status])}
        description={t('shares.emptyDescription', 'Links that families make with the Share button show up here.')}
      />
    );
  } else {
    body = (
      <>
        {/* Phones: one card per link. */}
        <ListCard className="lg:hidden">
          {shares.map((s) => (
            <ShareCardRow key={s.id} share={s} onRevoke={setRevoking} />
          ))}
        </ListCard>
        {/* PC: a table. */}
        <div className="hidden lg:block">
          <Table rows={shares} rowKey={(s) => s.id} columns={columns} className="rounded-xl" />
        </div>
        <div className="flex justify-center py-4">
          {hasNextPage ? (
            <Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
              {t('loadMore', 'Load more')}
            </Button>
          ) : (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('shares.shownCount', '{{count}} links', { count: total ?? shares.length })}
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {t('shares.subtitle', 'Every link made in every family. Turning one off stops it working straight away.')}
      </p>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {STATUSES.map((value) => (
            <TabsTrigger key={value} value={value} icon={STATUS_ICON[value]}>
              {statusLabel(value)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div>{body}</div>

      <ConfirmModal
        isOpen={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={handleRevoke}
        title={t('shares.confirmTitle', 'Turn off this link?')}
        description={t(
          'shares.confirmDescription',
          '“{{title}}” from {{family}}. Anyone who has this link will not be able to open it any more. The family can make a new link if they need one.',
          { title: revoking?.targetTitle || t('shares.untitled', '(no name)'), family: revoking?.family?.name || '—' },
        )}
        confirmLabel={t('shares.revoke', 'Revoke')}
      />
    </div>
  );
}

function statusOf(share) {
  return STATUS_TONE[share.status] ? share.status : shareStatusOf(share);
}

function TargetCell({ share }) {
  const { t } = useTranslation('adminOps');
  const isFolder = share.targetType === 'folder';
  const Icon = isFolder ? Folder : FileText;
  return (
    <span className="flex items-center gap-3 min-w-0">
      <ListIcon icon={Icon} kind={isFolder ? 'folder' : 'document'} />
      <span className="min-w-0">
        <span className="block font-medium truncate max-w-[16rem]">{share.targetTitle || t('shares.untitled', '(no name)')}</span>
        <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <StatusBadge share={share} />
          {share.hasPassword && <PasswordBadge />}
        </span>
      </span>
    </span>
  );
}

function StatusBadge({ share }) {
  const { t } = useTranslation('adminOps');
  const status = statusOf(share);
  return (
    <Badge tone={STATUS_TONE[status] || 'gray'}>
      {t(`shares.status.${status}`, { active: 'Active', expired: 'Expired', revoked: 'Turned off' }[status] || status)}
    </Badge>
  );
}

function PasswordBadge() {
  const { t } = useTranslation('adminOps');
  return (
    <Badge tone="blue">
      <span className="inline-flex items-center gap-1">
        <Lock className="h-3 w-3" aria-hidden="true" />
        {t('shares.password', 'Password')}
      </span>
    </Badge>
  );
}

/** "Expires in 2 hours" / "Expired 3 days ago" / "Turned off yesterday" / "Never expires". */
function ExpiryText({ share }) {
  const { t } = useTranslation('adminOps');
  const status = statusOf(share);
  let text;
  let when;
  if (status === 'revoked') {
    when = share.revokedAt;
    text = share.revokedAt
      ? t('shares.revokedWhen', 'Turned off {{when}}', { when: formatRelativeTime(share.revokedAt) })
      : t('shares.status.revoked', 'Turned off');
  } else if (!share.expiresAt) {
    text = t('shares.neverExpires', 'Never expires');
  } else if (status === 'expired') {
    when = share.expiresAt;
    text = t('shares.expiredWhen', 'Expired {{when}}', { when: formatRelativeTime(share.expiresAt) });
  } else {
    when = share.expiresAt;
    text = t('shares.expiresWhen', 'Expires {{when}}', { when: formatRelativeTime(share.expiresAt) });
  }
  return (
    <span
      title={when ? formatDateTime(when) : undefined}
      className={status === 'active' ? '' : 'text-neutral-500 dark:text-neutral-400'}
    >
      {text}
    </span>
  );
}

function OpensText({ share, short = false }) {
  const { t } = useTranslation('adminOps');
  const opens = Number(share.opens) || 0;
  if (short) {
    return (
      <span title={share.lastOpenedAt ? t('shares.lastOpened', 'Last opened {{when}}', { when: formatDateTime(share.lastOpenedAt) }) : undefined}>
        {opens}
      </span>
    );
  }
  return <span>{t('shares.opened', { count: opens, defaultValue: 'Opened {{count}} times' })}</span>;
}

function RevokeButton({ share, onRevoke }) {
  const { t } = useTranslation('adminOps');
  if (statusOf(share) !== 'active') return null;
  return (
    <Button variant="danger-ghost" size="sm" onClick={() => onRevoke(share)}>
      {t('shares.revoke', 'Revoke')}
    </Button>
  );
}

function ShareCardRow({ share, onRevoke }) {
  const { t } = useTranslation('adminOps');
  const isFolder = share.targetType === 'folder';
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-start gap-3">
        <ListIcon icon={isFolder ? Folder : FileText} kind={isFolder ? 'folder' : 'document'} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 break-words">
            {share.targetTitle || t('shares.untitled', '(no name)')}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 break-words">
            {[share.family?.name, share.createdBy?.name || share.createdBy?.email].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge share={share} />
        {share.hasPassword && <PasswordBadge />}
      </div>
      <p className="text-xs text-neutral-600 dark:text-neutral-300">
        <ExpiryText share={share} />
        {' · '}
        <OpensText share={share} />
      </p>
      {statusOf(share) === 'active' && (
        <Button variant="danger-ghost" block onClick={() => onRevoke(share)}>
          {t('shares.revoke', 'Revoke')}
        </Button>
      )}
    </div>
  );
}
