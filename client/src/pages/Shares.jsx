import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

function ShareRowActions({ share, onRevoke, onDelete, onExtend, onViewLog }) {
  const status = shareStatusOf(share);
  return (
    <Dropdown trigger={<Button variant="ghost" size="icon" aria-label="Share actions"><MoreIcon className="w-5 h-5" /></Button>} align="right">
      <DropdownItem onSelect={() => onViewLog(share)}>View access log</DropdownItem>
      {status === 'active' && <DropdownItem onSelect={() => onExtend(share)}>Extend expiry</DropdownItem>}
      {status === 'active' && (
        <DropdownItem danger onSelect={() => onRevoke(share)}>
          Revoke
        </DropdownItem>
      )}
      <DropdownDivider />
      <DropdownItem danger onSelect={() => onDelete(share)}>
        Delete
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
    toast.success('Share link revoked');
    invalidate();
  };

  const handleDelete = async () => {
    await sharesApi.remove(deleteShare.id);
    toast.success('Share deleted');
    invalidate();
  };

  const columns = [
    {
      key: 'target',
      label: 'Shared item',
      render: (s) => (
        <div className="min-w-0">
          <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-[220px]">{s.targetLabel || '(untitled)'}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mt-0.5">
            <Badge tone="gray">{TARGET_TYPE_LABEL[s.targetType] || s.targetType}</Badge>
            {s.label && <span className="truncate max-w-[140px]">{s.label}</span>}
          </div>
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (s) => <StatusPill shareStatus={shareStatusOf(s)} size="sm" /> },
    {
      key: 'expires',
      label: 'Expires',
      render: (s) => (
        <div className="text-sm">
          <div className="text-neutral-700 dark:text-neutral-300">{formatTimeRemaining(s)}</div>
          <div className="text-xs text-neutral-400">{formatExpiry(s)}</div>
        </div>
      ),
    },
    {
      key: 'opens',
      label: 'Opens / Downloads',
      align: 'center',
      render: (s) => (
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {s.openCount ?? 0} / {s.downloadCount ?? 0}
        </span>
      ),
    },
    {
      key: 'link',
      label: 'Link',
      render: () => (
        <span className="text-xs text-neutral-400 italic" title="The one-time link is only shown right after creation. Revoke and recreate if it was lost.">
          Not recoverable
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
        />
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader title="Shares" subtitle={`${filtered.length} link${filtered.length === 1 ? '' : 's'}`} />

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setStatusTab(t.value)}
              className={`px-3 py-1.5 text-sm rounded-full font-medium whitespace-nowrap transition-colors ${
                statusTab === t.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by document or folder name…" className="flex-1" />
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 min-h-[44px]"
          >
            <option value="all">All types</option>
            <option value="document">Documents</option>
            <option value="folder">Folders</option>
            <option value="item">Items</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600 dark:text-red-400 text-center py-10">Could not load shares.</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShareIcon className="w-16 h-16" />}
          title="No shares yet"
          description="Share a document or folder from Browse to create a link — it'll show up here."
        />
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden sm:block">
            <Card>
              <Table rows={filtered} rowKey={(s) => s.id} columns={columns} emptyMessage="No shares" />
            </Card>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-3">
            {filtered.map((s) => (
              <Card key={s.id}>
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{s.targetLabel || '(untitled)'}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge tone="gray">{TARGET_TYPE_LABEL[s.targetType] || s.targetType}</Badge>
                        <StatusPill shareStatus={shareStatusOf(s)} size="sm" />
                      </div>
                    </div>
                    <ShareRowActions
                      share={s}
                      onExtend={setExtendShare}
                      onRevoke={setRevokeShare}
                      onDelete={setDeleteShare}
                      onViewLog={setLogShare}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                    <span>{formatTimeRemaining(s)}</span>
                    <span>
                      {s.openCount ?? 0} opens · {s.downloadCount ?? 0} downloads
                    </span>
                  </div>
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
        title="Revoke this share link?"
        description="Anyone with the link will immediately lose access. This can't be undone — create a new link if you need to share again."
        confirmLabel="Revoke"
      />

      <ConfirmModal
        isOpen={!!deleteShare}
        onClose={() => setDeleteShare(null)}
        onConfirm={handleDelete}
        title="Delete this share record?"
        description="Permanently removes this share and its access log. If the link is still active, revoke it instead to cut access immediately without losing the history."
        confirmLabel="Delete"
      />
    </div>
  );
}
