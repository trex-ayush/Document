import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Button from '@/components/ui/Button.jsx';
import PasswordInput from '@/components/ui/PasswordInput.jsx';
import { Skeleton, SkeletonHeader } from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import { Card, CardBody } from '@/components/ui/Card.jsx';
import FolderPicker from '@/features/folders/FolderPicker.jsx';
import FolderBreadcrumb from '@/features/documents/FolderBreadcrumb.jsx';
import { useFolderPath } from '@/features/documents/useFolderPath.js';
import CopyButton from '@/features/items/CopyButton.jsx';
import { useItem, useUpdateItem, useDeleteItem } from '@/features/items/itemsHooks.js';
import { FolderInput, KeyRound, Pencil, StickyNote, Trash2 } from 'lucide-react';

function Row({ label, children, actions }) {
  return (
    <div className="flex items-center gap-3 border-b border-neutral-100 py-3 first:pt-0 last:border-b-0 last:pb-0 dark:border-neutral-700">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
        <div className="mt-0.5 break-words text-sm text-neutral-900 dark:text-neutral-100">{children}</div>
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

/** `/items/:id` — one saved password or note. Items are not shareable. */
export default function ItemDetail() {
  const { t } = useTranslation(['items', 'common']);
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: item, isLoading, isError } = useItem(id);
  const update = useUpdateItem(id);
  const del = useDeleteItem();
  const where = useFolderPath(item?.folderId);

  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) {
    return (
      <PageContainer>
        <SkeletonHeader action />
        <Card>
          <CardBody className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton variant="line" width={90} />
                <Skeleton variant="line" height={14} width={`${50 - i * 10}%`} className="mt-2" />
              </div>
            ))}
          </CardBody>
        </Card>
      </PageContainer>
    );
  }

  if (isError || !item) {
    return (
      <PageContainer>
        <EmptyState
          image="/assets/empty-documents.png"
          title={t('detail.notFoundTitle', 'Not found')}
          description={t('detail.notFoundDescription', 'It may have been moved to the Bin.')}
          action={<Button as={Link} to="/browse">{t('detail.goToFolders', 'Go to folders')}</Button>}
        />
      </PageContainer>
    );
  }

  const isNote = item.kind === 'note';
  const fields = (item.fields || []).filter((f) => f.key || f.value);

  const handleMove = (folderId) => {
    const target = !folderId || folderId === 'root' ? where.sharedFolderId : folderId;
    if (!target || target === item.folderId) return;
    update.mutate(
      { folderId: target },
      {
        onSuccess: () => toast.success(t('detail.toasts.moved', 'Moved')),
        onError: (err) => toast.error(err?.response?.data?.message || t('detail.toasts.moveFailed', 'Could not move it')),
      },
    );
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync(id);
      toast.success(t('detail.toasts.deleted', 'Moved to the Bin'));
      navigate(item.folderId ? `/browse/${item.folderId}` : '/browse', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('detail.toasts.deleteFailed', 'Could not delete it'));
    }
  };

  const KindIcon = isNote ? StickyNote : KeyRound;

  return (
    <PageContainer>
      <PageHeader
        title={<span className="break-words">{item.title}</span>}
        breadcrumb={<FolderBreadcrumb path={where.path} />}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <KindIcon className="h-4 w-4" aria-hidden="true" />
            {isNote ? t('kinds.note', 'Note') : t('kinds.login', 'Password')}
          </span>
        }
        actions={
          <>
            <Button as={Link} to={`/items/${item.id}/edit`} variant="secondary" leftIcon={<Pencil className="h-4 w-4" />}>
              {t('common:actions.edit', 'Edit')}
            </Button>
            <Button variant="secondary" leftIcon={<FolderInput className="h-4 w-4" />} onClick={() => setMoveOpen(true)}>
              {t('common:actions.move', 'Move')}
            </Button>
            <Button variant="danger-ghost" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>
              {t('common:actions.delete', 'Delete')}
            </Button>
          </>
        }
      />

      <Card>
        <CardBody>
          {!isNote && (
            <>
              <Row label={t('form.usernameLabel', 'Username / email')} actions={item.username ? <CopyButton value={item.username} label={t('detail.copyUsername', 'Copy username')} /> : null}>
                {item.username || <span className="text-neutral-500 dark:text-neutral-400">—</span>}
              </Row>
              <Row
                label={t('form.passwordLabel', 'Password')}
                actions={item.password ? <CopyButton value={item.password} label={t('detail.copyPassword', 'Copy password')} /> : null}
              >
                {item.password ? (
                  <div className="mt-1">
                    <PasswordInput readOnly value={item.password} aria-label={t('form.passwordLabel', 'Password')} className="font-mono" />
                  </div>
                ) : (
                  <span className="text-neutral-500 dark:text-neutral-400">—</span>
                )}
              </Row>
              {fields.map((f, i) => (
                <Row key={`${f.key}-${i}`} label={f.key} actions={f.value ? <CopyButton value={f.value} label={t('detail.copyField', 'Copy {{name}}', { name: f.key })} /> : null}>
                  {f.value || <span className="text-neutral-500 dark:text-neutral-400">—</span>}
                </Row>
              ))}
            </>
          )}
          <Row label={t('form.notesLabel', 'Notes')} actions={isNote && item.notes ? <CopyButton value={item.notes} label={t('detail.copyNotes', 'Copy notes')} /> : null}>
            {item.notes ? (
              <p className="whitespace-pre-wrap">{item.notes}</p>
            ) : (
              <span className="text-neutral-500 dark:text-neutral-400">{t('detail.noNotes', 'No notes yet.')}</span>
            )}
          </Row>
        </CardBody>
      </Card>

      <FolderPicker
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        onPick={handleMove}
        initialFolderId={item.folderId}
        title={t('detail.moveTitle', 'Move to…')}
      />

      <ConfirmDrawer
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('detail.deleteTitle', 'Delete “{{title}}”?', { title: item.title })}
        description={t('detail.deleteDescription', 'It moves to the Bin. You can bring it back from the Bin.')}
        confirmLabel={t('detail.moveToBin', 'Move to Bin')}
      />
    </PageContainer>
  );
}
