import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Button from '@/components/ui/Button.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { ListCard, ListIcon, ListRow } from '@/components/ui/ListRow.jsx';
import { ErrorState } from '@/components/ui/PageState.jsx';
import { SkeletonRows } from '@/components/ui/Skeleton.jsx';
import { formatRelativeTime } from '@/i18n/formatters.js';
import { binApi } from '@/services/binApi.js';
import { File, FileText, Folder, StickyNote } from 'lucide-react';
import { useCanWrite } from '@/hooks/useCanWrite.js';

const TYPE_ICON = { document: FileText, folder: Folder, item: StickyNote, file: File };
const TYPE_KIND = { document: 'document', folder: 'folder', item: 'note', file: 'document' };

/**
 * `/bin` — this family's soft-deleted documents, folders, vault items and single files (a file
 * shows which document it came from; restoring it also brings that document back if it was
 * deleted too) (docs/DECISIONS.md
 * "Soft delete / recycle bin"). Nothing here is ever removed automatically — restoring is the
 * only action a regular family member/admin can take; permanent deletion is platform-owner-only
 * (Admin > Settings, `pages/admin/AdminSettings.jsx`), by explicit product decision.
 */
export default function Bin() {
  const { t } = useTranslation('bin');
  const canWrite = useCanWrite();
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
      if (entry.type === 'file') await binApi.restoreFile(entry.id);
      else await binApi.restore(entry.type, entry.id);
      toast.success(t('restored', '"{{name}}" is back', { name: entry.name }));
      invalidateEverything();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('restoreFailed', 'Could not restore this.'));
    }
  };

  const typeLabel = (type) => {
    if (type === 'document') return t('type.document', 'Document');
    if (type === 'folder') return t('type.folder', 'Folder');
    if (type === 'file') return t('type.file', 'File');
    return t('type.item', 'Password or note');
  };

  const metaFor = (entry) => {
    const when = formatRelativeTime(entry.deletedAt);
    const parts = [typeLabel(entry.type)];
    if (entry.type === 'file' && entry.documentTitle) parts.push(t('fromDocument', 'from {{title}}', { title: entry.documentTitle }));
    parts.push(
      entry.deletedByName
        ? t('deletedAgoBy', 'Deleted {{when}} by {{name}}', { when, name: entry.deletedByName })
        : t('deletedAgo', 'Deleted {{when}}', { when }),
    );
    return parts.join(' · ');
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('title', 'Bin')}
        subtitle={t('subtitle', 'Things you delete wait here. Tap Restore to bring one back.')}
      />

      {isLoading ? (
        <SkeletonRows count={5} action />
      ) : isError ? (
        <ErrorState>{t('loadError', 'Could not load the bin.')}</ErrorState>
      ) : items.length === 0 ? (
        <EmptyState
          image="/assets/empty-bin.png"
          title={t('emptyTitle', 'The bin is empty')}
          description={t('emptyDescription', 'Anything you delete shows up here first, so you can bring it back if you change your mind.')}
        />
      ) : (
        <ListCard columns>
          {items.map((entry) => (
            <ListRow
              wrapMeta
              key={`${entry.type}-${entry.id}`}
              icon={<ListIcon icon={TYPE_ICON[entry.type] || FileText} kind={TYPE_KIND[entry.type] || 'document'} />}
              title={entry.name}
              meta={metaFor(entry)}
              snippet={entry.type === 'file' && entry.documentDeleted ? t('restoresDocument', 'Restoring also brings back the document.') : null}
              actions={
                // View-only members can see what's in the Bin but not restore it (the server refuses).
                canWrite ? (
                  <Button variant="secondary" size="sm" onClick={() => handleRestore(entry)}>
                    {t('restore', 'Restore')}
                  </Button>
                ) : null
              }
            />
          ))}
        </ListCard>
      )}
    </PageContainer>
  );
}
