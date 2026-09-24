import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Table from '@/components/ui/Table.jsx';
import Badge from '@/components/ui/Badge.jsx';
import StatusPill from '@/components/ui/StatusPill.jsx';
import SearchInput from '@/components/ui/SearchInput.jsx';
import Button from '@/components/ui/Button.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmModal from '@/components/ui/ConfirmModal.jsx';
import { Dropdown, DropdownItem, DropdownDivider } from '@/components/ui/Dropdown.jsx';
import { MoreIcon, ShareIcon } from '@/components/layout/icons.jsx';
import { sharesApi } from '@/services/sharesApi.js';
import { formatRelativeTime } from '@/i18n/formatters.js';
import {
  shareStatusOf,
  formatExpiry,
  formatTimeRemaining,
  ShareAccessLogDrawer,
  ExtendShareModal,
} from '@/features/share/index.js';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
];

const TARGET_TYPE_LABEL = { document: 'Document', folder: 'Folder', item: 'Item' };

function ShareRowActions({ share, onRevoke, onDelete, onExtend, onViewLog, t }) {
  const status = shareStatusOf(share);
  return (
    <Dropdown trigger={<Button variant="ghost" size="icon" aria-label={t('rowActions.ariaLabel', 'Share actions')}><MoreIcon className="w-5 h-5" /></Button>} align="right">
      <DropdownItem onSelect={() => onViewLog(share)}>{t('rowActions.viewLog', 'View access log')}</DropdownItem>
      {status === 'active' && <DropdownItem onSelect={() => onExtend(share)}>{t('rowActions.extend', 'Extend expiry')}</DropdownItem>}
      {status === 'active' && (
        <DropdownItem danger onSelect={() => onRevoke(share)}>
          {t('common:actions.revoke', 'Revoke')}
        </DropdownItem>
      )}
      <DropdownDivider />
      <DropdownItem danger onSelect={() => onDelete(share)}>
        {t('common:actions.delete', 'Delete')}
      </DropdownItem>
    </Dropdown>
  );
}

/**
 * Shares management page (`/shares`). Lists shares created from anywhere in
 * the app (Browse/Document detail trigger `ShareCreateModal`, not this
 * page — see `client/src/features/share/ShareCreateModal.jsx`). Filters by
 * status server-side (`GET /shares?status=`) and by target type / a text
 * search over `targetLabel` client-side (no document/folder picker in this
 * agent's scope — `targetLabel` already covers "filter by document/folder"
 * via search).
 */
export default function Shares() {
  const { t } = useTranslation(['shares', 'common']);
  const queryClient = useQueryClient();
  const [statusTab, setStatusTab] = useState('all');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [logShare, setLogShare] = useState(null);
  const [extendShare, setExtendShare] = useState(null);
  const [revokeShare, setRevokeShare] = useState(null);
  const [deleteShare, setDeleteShare] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shares', statusTab],
    queryFn: () => sharesApi.list(statusTab !== 'all' ? { status: statusTab } : undefined),
  });

  const shares = data?.items || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shares.filter((s) => {
      if (targetTypeFilter !== 'all' && s.targetType !== targetTypeFilter) return false;
      if (q && !(s.targetLabel || '').toLowerCase().includes(q) && !(s.label || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [shares, targetTypeFilter, search]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shares'] });

  const handleRevoke = async () => {
    await sharesApi.update(revokeShare.id, { revoke: true });
    toast.success(t('toasts.revoked', 'Share link revoked'));
    invalidate();
  };

  const handleDelete = async () => {
    await sharesApi.remove(deleteShare.id);
    toast.success(t('toasts.deleted', 'Share deleted'));
    invalidate();
  };

  const columns = [
    {
      key: 'target',
      label: t('columns.sharedItem', 'Shared item'),
      render: (s) => (
        <div className="min-w-0">
          <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-[220px]">{s.targetLabel || t('page.untitled', '(untitled)')}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mt-0.5">
            <Badge tone="gray">{t(`targetType.${s.targetType}`, TARGET_TYPE_LABEL[s.targetType] || s.targetType)}</Badge>
            {s.label && <span className="truncate max-w-[140px]">{s.label}</span>}
          </div>
        </div>
      ),
    },
    { key: 'status', label: t('columns.status', 'Status'), render: (s) => <StatusPill shareStatus={shareStatusOf(s)} size="sm" /> },
    {
      key: 'expires',
      label: t('columns.expires', 'Expires'),
      render: (s) => (
        <div className="text-sm">
          <div className="text-neutral-700 dark:text-neutral-300">{formatTimeRemaining(s, t)}</div>
          <div className="text-xs text-neutral-400">{formatExpiry(s, t)}</div>
        </div>
      ),
    },
    {
      key: 'opens',
      label: t('columns.opensDownloads', 'Opens / Downloads'),
      align: 'center',
      render: (s) => (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          <div>{s.openCount ?? 0} / {s.downloadCount ?? 0}</div>
          {s.lastOpenedAt && (
            <div className="text-xs text-neutral-400 mt-0.5">
              {t('page.lastOpened', 'Last opened {{time}}', { time: formatRelativeTime(s.lastOpenedAt) })}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'link',
      label: t('columns.link', 'Link'),
      render: () => (
        <span className="text-xs text-neutral-400 italic" title={t('columns.linkTooltip', 'The one-time link is only shown right after creation. Revoke and recreate if it was lost.')}>
          {t('columns.linkNotRecoverable', 'Not recoverable')}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (s) => (
        <ShareRowActions
          share={s}
          onExtend={setExtendShare}
          onRevoke={setRevokeShare}
          onDelete={setDeleteShare}
          onViewLog={setLogShare}
          t={t}
        />
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title={t('page.title', 'Shares')}
        subtitle={
          filtered.length === 1
            ? t('page.linkCount_one', '{{count}} link', { count: filtered.length })
            : t('page.linkCount_other', '{{count}} links', { count: filtered.length })
        }
      />

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusTab(tab.value)}
              className={`px-3 py-1.5 text-sm rounded-full font-medium whitespace-nowrap transition-colors ${
                statusTab === tab.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              {tab.value === 'all' ? t('page.tabAll', 'All') : t(`common:status.${tab.value}`, tab.label)}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('page.searchPlaceholder', 'Search by document or folder name…')} className="flex-1" />
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 min-h-[44px]"
          >
            <option value="all">{t('page.typeFilter.all', 'All types')}</option>
            <option value="document">{t('page.typeFilter.documents', 'Documents')}</option>
            <option value="folder">{t('page.typeFilter.folders', 'Folders')}</option>
            <option value="item">{t('page.typeFilter.items', 'Items')}</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600 dark:text-red-400 text-center py-10">{t('page.loadError', 'Could not load shares.')}</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShareIcon className="w-16 h-16" />}
          title={t('page.emptyTitle', 'No shares yet')}
          description={t('page.emptyDescription', "Share a document or folder from Browse to create a link — it'll show up here.")}
        />
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden sm:block">
            <Card>
              <Table rows={filtered} rowKey={(s) => s.id} columns={columns} emptyMessage={t('page.tableEmpty', 'No shares')} />
            </Card>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-3">
            {filtered.map((s) => (
              <Card key={s.id}>
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{s.targetLabel || t('page.untitled', '(untitled)')}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge tone="gray">{t(`targetType.${s.targetType}`, TARGET_TYPE_LABEL[s.targetType] || s.targetType)}</Badge>
                        <StatusPill shareStatus={shareStatusOf(s)} size="sm" />
                      </div>
                    </div>
                    <ShareRowActions
                      share={s}
                      onExtend={setExtendShare}
                      onRevoke={setRevokeShare}
                      onDelete={setDeleteShare}
                      onViewLog={setLogShare}
                      t={t}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                    <span>{formatTimeRemaining(s, t)}</span>
                    <span>
                      {t('page.opensDownloadsMobile', '{{opens}} opens · {{downloads}} downloads', { opens: s.openCount ?? 0, downloads: s.downloadCount ?? 0 })}
                    </span>
                  </div>
                  {s.lastOpenedAt && (
                    <div className="text-xs text-neutral-400">
                      {t('page.lastOpened', 'Last opened {{time}}', { time: formatRelativeTime(s.lastOpenedAt) })}
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}

      <ShareAccessLogDrawer isOpen={!!logShare} onClose={() => setLogShare(null)} shareId={logShare?.id} shareLabel={logShare?.targetLabel} />

      <ExtendShareModal isOpen={!!extendShare} onClose={() => setExtendShare(null)} share={extendShare} onExtended={invalidate} />

      <ConfirmModal
        isOpen={!!revokeShare}
        onClose={() => setRevokeShare(null)}
        onConfirm={handleRevoke}
        title={t('revokeModal.title', 'Revoke this share link?')}
        description={t('revokeModal.description', "Anyone with the link will immediately lose access. This can't be undone — create a new link if you need to share again.")}
        confirmLabel={t('common:actions.revoke', 'Revoke')}
      />

      <ConfirmModal
        isOpen={!!deleteShare}
        onClose={() => setDeleteShare(null)}
        onConfirm={handleDelete}
        title={t('deleteModal.title', 'Delete this share record?')}
        description={t('deleteModal.description', 'Permanently removes this share and its access log. If the link is still active, revoke it instead to cut access immediately without losing the history.')}
        confirmLabel={t('common:actions.delete', 'Delete')}
      />
    </div>
  );
}
