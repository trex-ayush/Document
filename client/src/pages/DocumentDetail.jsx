import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { FIELD_GAP, SECTION_TITLE } from '@/components/ui/tokens.js';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Textarea from '@/components/ui/Textarea.jsx';
import Skeleton from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import { Card, CardBody } from '@/components/ui/Card.jsx';
import FolderPicker from '@/features/folders/FolderPicker.jsx';
import ShareButton from '@/features/share/ShareButton.jsx';
import { useDocument, useUpdateDocument, useDeleteDocument } from '@/features/documents/documentsHooks.js';
import { useFolderPath } from '@/features/documents/useFolderPath.js';
import FileGallery from '@/features/documents/FileGallery.jsx';
import FolderBreadcrumb from '@/features/documents/FolderBreadcrumb.jsx';
import { FolderInput, Pencil, Trash2 } from 'lucide-react';

const TITLE_MAX = 200;
const NOTES_MAX = 10000;

/** `/documents/:id` — one simple screen: title, notes (view → Edit inline), files. */
export default function DocumentDetail() {
  const { t } = useTranslation(['documents', 'common']);
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: doc, isLoading, isError } = useDocument(id);
  const update = useUpdateDocument(id);
  const del = useDeleteDocument();
  const where = useFolderPath(doc?.folderId);

  const [editing, setEditing] = useState(null); // { title, notes } while editing
  const [titleError, setTitleError] = useState(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) {
    return (
      <PageContainer className="space-y-4">
        <Skeleton height={28} width="50%" />
        <Skeleton height={120} rounded="lg" />
        <Skeleton height={200} rounded="lg" />
      </PageContainer>
    );
  }

  if (isError || !doc) {
    return (
      <PageContainer>
        <EmptyState
          image="/assets/empty-documents.png"
          title={t('detail.notFoundTitle', 'Document not found')}
          description={t('detail.notFoundDescription', 'It may have been moved to the Bin.')}
          action={<Button as={Link} to="/browse">{t('detail.goToFolders', 'Go to folders')}</Button>}
        />
      </PageContainer>
    );
  }

  const startEdit = () => {
    setTitleError(null);
    setEditing({ title: doc.title || '', notes: doc.notes || '' });
  };

  const handleSave = async () => {
    const title = editing.title.trim();
    if (!title) {
      setTitleError(t('add.titleRequired', 'Please give it a title'));
      return;
    }
    try {
      await update.mutateAsync({ title, notes: editing.notes });
      toast.success(t('detail.toasts.updated', 'Saved'));
      setEditing(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('detail.toasts.saveFailed', 'Could not save changes'));
    }
  };

  const handleMove = (folderId) => {
    const target = !folderId || folderId === 'root' ? where.sharedFolderId : folderId;
    if (!target || target === doc.folderId) return;
    update.mutate(
      { folderId: target },
      {
        onSuccess: () => toast.success(t('detail.toasts.moved', 'Document moved')),
        onError: (err) => toast.error(err?.response?.data?.message || t('detail.toasts.moveFailed', 'Could not move the document')),
      },
    );
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync(id);
      toast.success(t('detail.toasts.deleted', 'Moved to the Bin'));
      navigate(doc.folderId ? `/browse/${doc.folderId}` : '/browse', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('detail.toasts.deleteFailed', 'Could not delete the document'));
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={<span className="break-words">{doc.title}</span>}
        breadcrumb={<FolderBreadcrumb path={where.path} />}
        actions={
          <>
            <ShareButton targetType="document" targetId={doc.id} />
            <Button variant="secondary" leftIcon={<FolderInput className="h-4 w-4" />} onClick={() => setMoveOpen(true)}>
              {t('common:actions.move', 'Move')}
            </Button>
            <Button variant="danger-ghost" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>
              {t('common:actions.delete', 'Delete')}
            </Button>
          </>
        }
      />

      <Card className="mb-4 sm:mb-6">
        <CardBody>
          {editing ? (
            <div className={FIELD_GAP}>
              <Input
                label={<>{t('add.titleLabel', 'Title')} <span className="text-red-500">*</span></>}
                required
                maxLength={TITLE_MAX}
                value={editing.title}
                error={titleError}
                onChange={(e) => {
                  setTitleError(null);
                  setEditing({ ...editing, title: e.target.value });
                }}
              />
              <Textarea
                label={t('add.notesLabel', 'Notes')}
                rows={6}
                maxLength={NOTES_MAX}
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)} disabled={update.isPending}>
                  {t('common:actions.cancel', 'Cancel')}
                </Button>
                <Button onClick={handleSave} loading={update.isPending}>
                  {t('common:actions.save', 'Save')}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className={SECTION_TITLE}>{t('add.notesLabel', 'Notes')}</h2>
                <Button variant="ghost" size="sm" leftIcon={<Pencil className="h-4 w-4" />} onClick={startEdit}>
                  {t('common:actions.edit', 'Edit')}
                </Button>
              </div>
              {doc.notes ? (
                <p className="whitespace-pre-wrap break-words text-sm text-neutral-700 dark:text-neutral-300">{doc.notes}</p>
              ) : (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('detail.noNotes', 'No notes yet.')}</p>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <FileGallery document={doc} />

      <FolderPicker
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        onPick={handleMove}
        initialFolderId={doc.folderId}
        title={t('detail.moveDocumentTitle', 'Move document to…')}
      />

      <ConfirmDrawer
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('detail.deleteTitle', 'Delete “{{title}}”?', { title: doc.title })}
        description={t('detail.deleteDescription', 'It moves to the Bin with all its files. You can bring it back from the Bin.')}
        confirmLabel={t('detail.moveToBin', 'Move to Bin')}
      />
    </PageContainer>
  );
}
