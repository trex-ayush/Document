import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Button from '@/components/ui/Button.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { ListCard, ListIcon, ListRow } from '@/components/ui/ListRow.jsx';
import { ErrorState, LoadingState } from '@/components/ui/PageState.jsx';
import { formatRelativeTime } from '@/i18n/formatters.js';
import binApi from '@/services/binApi.js';
import { FileText, Folder, StickyNote } from 'lucide-react';

const TYPE_ICON = { document: FileText, folder: Folder, item: StickyNote };
const TYPE_KIND = { document: 'document', folder: 'folder', item: 'note' };

/**
 * `/bin` — this family's soft-deleted documents, folders and vault items (docs/DECISIONS.md
 * "Soft delete / recycle bin"). Nothing here is ever removed automatically — restoring is the
 * only action a regular family member/admin can take; permanent deletion is platform-owner-only
 * (PlatformSettings.jsx's own bin section), by explicit product decision.
 */
export default function Bin() {
  const { t } = useTranslation('bin');
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({ queryKey: ['bin'], queryFn: () => binApi.list() });
  const items = data?.items || [];

  const invalidateEverything = () => {
    queryClient.invalidateQueries({ queryKey: ['bin'] });
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['items'] });
    queryClient.invalidateQueries({ queryKey: ['browse'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['search'] });
  };

  const handleRestore = async (entry) => {
    try {
      await binApi.restore(entry.type, entry.id);
      toast.success(t('restored', '"{{name}}" is back', { name: entry.name }));
      invalidateEverything();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('restoreFailed', 'Could not restore this.'));
    }
  };

  const typeLabel = (type) => {
    if (type === 'document') return t('type.document', 'Document');
    if (type === 'folder') return t('type.folder', 'Folder');
    return t('type.item', 'Password or note');
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('title', 'Bin')}
        subtitle={t('subtitle', 'Things you delete wait here. Tap Restore to bring one back.')}
      />

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState>{t('loadError', 'Could not load the bin.')}</ErrorState>
      ) : items.length === 0 ? (
        <EmptyState
          image="/assets/empty-bin.png"
          title={t('emptyTitle', 'The bin is empty')}
          description={t('emptyDescription', 'Anything you delete shows up here first, so you can bring it back if you change your mind.')}
        />
      ) : (
        <ListCard>
          {items.map((entry) => (
            <ListRow
              wrapMeta
              key={`${entry.type}-${entry.id}`}
              icon={<ListIcon icon={TYPE_ICON[entry.type] || FileText} kind={TYPE_KIND[entry.type] || 'document'} />}
              title={entry.name}
              meta={`${typeLabel(entry.type)} · ${t('deletedAgo', 'Deleted {{when}}', { when: formatRelativeTime(entry.deletedAt) })}`}
              actions={
                <Button variant="secondary" size="sm" onClick={() => handleRestore(entry)}>
                  {t('restore', 'Restore')}
                </Button>
              }
            />
          ))}
        </ListCard>
      )}
    </PageContainer>
  );
}
