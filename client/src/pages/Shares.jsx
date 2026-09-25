import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FileText, Folder, Share2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Card from '@/components/ui/Card.jsx';
import Button from '@/components/ui/Button.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmModal from '@/components/ui/ConfirmModal.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { sharesApi } from '@/services/sharesApi.js';
import { shareStatusOf, formatExpiry, formatTimeRemaining } from '@/features/share/shareStatus.js';
import { useFolderTree } from '@/features/folders/foldersHooks.js';
import { folderName } from '@/features/folders/folderTreeUtils.js';

const FILTERS = ['active', 'all'];

/**
 * Shares page (`/shares`) — every link the family has made: what it shares, when it expires,
 * how many times it was opened, and a Revoke button. Links are made with the Share button on a
 * folder, document or file (features/share/ShareButton.jsx), never here.
 */
export default function Shares() {
  const { t } = useTranslation(['shares', 'common']);
  const queryClient = useQueryClient();
  const { membership } = useAuth();
  const isAdmin = membership?.role === 'admin';
  const [filter, setFilter] = useState('active');
  const [revokeShare, setRevokeShare] = useState(null);
  const [removeShare, setRemoveShare] = useState(null);

  const { data, isLoading, isError } = useQuery({ queryKey: ['shares'], queryFn: () => sharesApi.list() });

  const shares = useMemo(() => {
    const all = data?.items || [];
    return filter === 'active' ? all.filter((s) => shareStatusOf(s) === 'active') : all;
  }, [data, filter]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shares'] });

  const handleRevoke = async () => {
    try {
      await sharesApi.revoke(revokeShare.id);
      toast.success(t('toasts.revoked', 'Link turned off'));
      invalidate();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('toasts.revokeFailed', 'Could not turn off this link.'));
    }
  };

  const handleRemove = async () => {
    try {
      await sharesApi.remove(removeShare.id);
      toast.success(t('toasts.removed', 'Removed from the list'));
      invalidate();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('toasts.removeFailed', 'Could not remove this link.'));
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageHeader
        title={t('page.title', 'Shares')}
        subtitle={t('page.subtitle', 'Links you have sent. Anyone with a link can see its files until it expires.')}
      />

      <div className="mb-4 flex gap-2" role="tablist">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === value
                ? 'bg-primary-500 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
            }`}
          >
            {value === 'active' ? t('page.filterActive', 'Active') : t('page.filterAll', 'All')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-red-600 dark:text-red-400">{t('page.loadError', 'Could not load shares.')}</p>
      ) : shares.length === 0 ? (
        <EmptyState
          icon={<Share2 className="h-12 w-12" />}
          title={filter === 'active' ? t('page.emptyActiveTitle', 'No active links') : t('page.emptyTitle', 'No links yet')}
          description={t('page.emptyDescription', 'Open a folder or document and tap Share to send it to someone.')}
        />
      ) : (
        <Card className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {shares.map((s) => (
            <ShareRow key={s.id} share={s} isAdmin={isAdmin} onRevoke={setRevokeShare} onRemove={setRemoveShare} />
          ))}
        </Card>
      )}

      <ConfirmModal
        isOpen={!!revokeShare}
        onClose={() => setRevokeShare(null)}
        onConfirm={handleRevoke}
        title={t('revokeModal.title', 'Turn off this link?')}
        description={t('revokeModal.description', 'Anyone who has the link will not be able to open it any more. You can always make a new link.')}
        confirmLabel={t('actions.revoke', 'Revoke')}
      />

      <ConfirmModal
        isOpen={!!removeShare}
        onClose={() => setRemoveShare(null)}
        onConfirm={handleRemove}
        title={t('removeModal.title', 'Remove from the list?')}
        description={t('removeModal.description', 'This link already stopped working. Removing it only tidies up this list.')}
        confirmLabel={t('common:actions.remove', 'Remove')}
      />
    </div>
  );
}

function ShareRow({ share, isAdmin, onRevoke, onRemove }) {
  const { t } = useTranslation(['shares', 'common']);
  const status = shareStatusOf(share);
  const Icon = share.targetType === 'folder' ? Folder : FileText;
  const opens = share.openCount ?? 0;
  const typeLabel = share.targetType === 'folder' ? t('targetType.folder', 'Folder') : t('targetType.document', 'Document');
  // The Shared folder is stored as "Shared"; show it in the reader's language.
  const { data: tree } = useFolderTree({ enabled: share.targetType === 'folder' });
  const sharedFolder = share.targetType === 'folder' ? tree?.items?.find((f) => f.id === share.targetId && f.isSystem) : null;
  const label = sharedFolder ? folderName(sharedFolder, t) : share.targetLabel;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label || t('page.untitled', '(no name)')}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          <span>{typeLabel}</span>
          {' · '}
          <span
            title={status === 'active' ? formatExpiry(share) : undefined}
            className={status === 'active' ? '' : 'text-red-600 dark:text-red-400'}
          >
            {formatTimeRemaining(share, t)}
          </span>
          {' · '}
          <span>
            {opens === 1
              ? t('page.opened_one', 'Opened {{count}} time', { count: opens })
              : t('page.opened_other', 'Opened {{count}} times', { count: opens })}
          </span>
        </p>
      </div>
      {status === 'active' ? (
        <Button variant="outline" size="sm" className="flex-shrink-0" onClick={() => onRevoke(share)}>
          {t('actions.revoke', 'Revoke')}
        </Button>
      ) : isAdmin ? (
        <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => onRemove(share)}>
          {t('common:actions.remove', 'Remove')}
        </Button>
      ) : null}
    </div>
  );
}
