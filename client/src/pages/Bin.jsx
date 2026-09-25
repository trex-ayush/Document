import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Button from '@/components/ui/Button.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import Badge from '@/components/ui/Badge.jsx';
import { formatRelativeTime } from '@/i18n/formatters.js';
import binApi from '@/services/binApi.js';
import { FileText, Folder, StickyNote } from 'lucide-react';

const TYPE_ICON = { document: FileText, folder: Folder, item: StickyNote };

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
  };

  const handleRestore = async (entry) => {
    try {
      await binApi.restore(entry.type, entry.id);
      toast.success(t('restored', '"{{name}}" is back', { name: entry.name }));
      invalidateEverything();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('restoreFailed', 'Could not restore this item.'));
    }
  };

  const typeLabel = (type) => {
    if (type === 'document') return t('type.document', 'Document');
    if (type === 'folder') return t('type.folder', 'Folder');
    return t('type.item', 'Vault item');
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <PageHeader
        title={t('title', 'Bin')}
        subtitle={t('subtitle', "Deleted documents, folders and vault items stay here until you restore them — they're never removed for good.")}
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600 dark:text-red-400 text-center py-10">
          {t('loadError', 'Could not load the bin.')}
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          image="/assets/empty-bin.png"
          title={t('emptyTitle', 'The bin is empty')}
          description={t('emptyDescription', 'Anything you delete shows up here first, so you can bring it back if you change your mind.')}
        />
      ) : (
        <div className="space-y-2">
          {items.map((entry) => {
            const Icon = TYPE_ICON[entry.type] || FileText;
            return (
              <Card key={`${entry.type}-${entry.id}`}>
                <CardBody className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-neutral-400" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{entry.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge tone="gray">{typeLabel(entry.type)}</Badge>
                      <span className="text-xs text-neutral-400">
                        {t('deletedAgo', 'Deleted {{when}}', { when: formatRelativeTime(entry.deletedAt) })}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-[44px] flex-shrink-0"
                    onClick={() => handleRestore(entry)}
                  >
                    {t('restore', 'Restore')}
                  </Button>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
