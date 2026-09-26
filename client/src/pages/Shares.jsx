import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FileText, Folder, History, Link2, Share2 } from 'lucide-react';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Button from '@/components/ui/Button.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs.jsx';
import { ListCard, ListIcon, ListRow } from '@/components/ui/ListRow.jsx';
import { ErrorState } from '@/components/ui/PageState.jsx';
import { SkeletonRows } from '@/components/ui/Skeleton.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { sharesApi } from '@/services/sharesApi.js';
import { shareStatusOf, formatExpiry, formatTimeRemaining } from '@/features/share/shareStatus.js';
import { useFolderTree } from '@/features/folders/foldersHooks.js';
import { folderName } from '@/features/folders/folderTreeUtils.js';
import RequireWrite from '@/features/members/RequireWrite.jsx';
import Tooltip from '@/components/ui/Tooltip.jsx';

const FILTERS = ['active', 'all'];

/**
 * Shares page (`/shares`) — every link the family has made: what it shares, when it expires,
 * how many times it was opened, and a Revoke button. Links are made with the Share button on a
 * folder, document or file (features/share/ShareButton.jsx), never here.
 */
export default function Shares() {
  return (
    <RequireWrite>
      <SharesPage />
    </RequireWrite>
  );
}

function SharesPage() {
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
    <PageContainer>
      <PageHeader
        title={t('page.title', 'Shares')}
        subtitle={t('page.subtitle', 'Links you have sent. Anyone with a link can see its files until it expires.')}
      />

      <Tabs value={filter} onValueChange={setFilter} className="mb-4 sm:mb-6">
        <TabsList>
          {FILTERS.map((value) => (
            <TabsTrigger key={value} value={value} icon={value === 'active' ? Link2 : History}>
              {value === 'active' ? t('page.filterActive', 'Active') : t('page.filterAll', 'All')}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <SkeletonRows count={5} action />
      ) : isError ? (
        <ErrorState>{t('page.loadError', 'Could not load shares.')}</ErrorState>
      ) : shares.length === 0 ? (
        <EmptyState
          icon={<Share2 strokeWidth={1.5} />}
          title={filter === 'active' ? t('page.emptyActiveTitle', 'No active links') : t('page.emptyTitle', 'No links yet')}
          description={t('page.emptyDescription', 'Open a folder or document and tap Share to send it to someone.')}
        />
      ) : (
        <ListCard columns>
          {shares.map((s) => (
            <ShareRow key={s.id} share={s} isAdmin={isAdmin} onRevoke={setRevokeShare} onRemove={setRemoveShare} />
          ))}
        </ListCard>
      )}

      <ConfirmDrawer
        isOpen={!!revokeShare}
        onClose={() => setRevokeShare(null)}
        onConfirm={handleRevoke}
        title={t('revokeModal.title', 'Turn off this link?')}
        description={t('revokeModal.description', 'Anyone who has the link will not be able to open it any more. You can always make a new link.')}
        confirmLabel={t('actions.revoke', 'Revoke')}
      />

      <ConfirmDrawer
        isOpen={!!removeShare}
        onClose={() => setRemoveShare(null)}
        onConfirm={handleRemove}
        title={t('removeModal.title', 'Remove from the list?')}
        description={t('removeModal.description', 'This link already stopped working. Removing it only tidies up this list.')}
        confirmLabel={t('common:actions.remove', 'Remove')}
      />
    </PageContainer>
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
    <ListRow
      wrapMeta
      icon={<ListIcon icon={Icon} kind={share.targetType === 'folder' ? 'folder' : 'document'} />}
      title={label || t('page.untitled', '(no name)')}
      meta={
        <>
          <span>{typeLabel}</span>
          {share.targetInBin && (
            <>
              {' · '}
              {/* The link shows "not found" while its document or folder is in the Bin. */}
              <span className="text-amber-700 dark:text-amber-400">{t('page.inBin', 'In the Bin, link paused')}</span>
            </>
          )}
          {' · '}
          <Tooltip content={status === 'active' ? formatExpiry(share) : null} className="inline">
            <span className={status === 'active' ? '' : 'text-red-600 dark:text-red-400'}>
              {formatTimeRemaining(share, t)}
            </span>
          </Tooltip>
          {' · '}
          <span>
            {opens === 1
              ? t('page.opened_one', 'Opened {{count}} time', { count: opens })
              : t('page.opened_other', 'Opened {{count}} times', { count: opens })}
          </span>
        </>
      }
      actions={
        status === 'active' ? (
          <Tooltip content={t('tip.revoke', 'Turn off this link')}>
            <Button variant="secondary" size="sm" onClick={() => onRevoke(share)}>
              {t('actions.revoke', 'Revoke')}
            </Button>
          </Tooltip>
        ) : isAdmin ? (
          <Tooltip content={t('tip.remove', 'Remove from the list')}>
            <Button variant="ghost" size="sm" onClick={() => onRemove(share)}>
              {t('common:actions.remove', 'Remove')}
            </Button>
          </Tooltip>
        ) : null
      }
    />
  );
}
