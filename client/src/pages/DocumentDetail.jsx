import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import PageContainer from '@/components/ui/PageContainer.jsx';
import { FIELD_GAP, SECTION_TITLE } from '@/components/ui/tokens.js';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Textarea from '@/components/ui/Textarea.jsx';
import { Skeleton, SkeletonCards, SkeletonHeader } from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import { Card, CardBody } from '@/components/ui/Card.jsx';
import FolderPicker from '@/features/folders/FolderPicker.jsx';
import ShareButton from '@/features/share/ShareButton.jsx';
import { useDocument, useUpdateDocument, useDeleteDocument } from '@/features/documents/documentsHooks.js';
import { useFolderPath } from '@/features/documents/useFolderPath.js';
import FileGallery from '@/features/documents/FileGallery.jsx';
import FolderBreadcrumb from '@/features/documents/FolderBreadcrumb.jsx';
import { copyValue, parseNoteLines } from '@/features/documents/noteLines.js';
import CopyButton from '@/features/items/CopyButton.jsx';
import { Copy, FileText, FolderInput, Pencil, Trash2 } from 'lucide-react';
import { DropdownDivider, DropdownItem } from '@/components/ui/Dropdown.jsx';
import DetailHeader from '@/features/items/DetailHeader.jsx';
import DetailAside from '@/features/items/DetailAside.jsx';
import { documentsApi } from '@/services/documentsApi.js';
import { useCanWrite } from '@/hooks/useCanWrite.js';

const TITLE_MAX = 200;
/** Files then notes on the left, "About" + "Recent activity" on the right from lg; phones stack
 * files, notes, then the details. */
const COLUMNS = 'grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]';
const NOTES_MAX = 10000;

/** How many note rows show before "Show all (N)". */
const NOTE_ROWS_SHOWN = 3;

/**
 * Notes shown line by line: "Label: value" lines as a small label over the value, other lines as
 * plain text, each with a copy button that copies just that value. Only the first 3 rows show
 * until "Show all (N)" is tapped.
 */
function NoteLines({ lines }) {
  const { t } = useTranslation(['documents', 'items']);
  const [open, setOpen] = useState(false);
  const rowCount = lines.filter((l) => l.type !== 'heading').length;
  const collapsible = rowCount > NOTE_ROWS_SHOWN;
  let shown = lines;
  if (collapsible && !open) {
    // Cut after the 3rd row (headings don't count as rows).
    let rows = 0;
    const end = lines.findIndex((l) => l.type !== 'heading' && ++rows === NOTE_ROWS_SHOWN);
    shown = lines.slice(0, end + 1);
  }
  return (
    <>
    <ul className={`divide-y divide-neutral-100 dark:divide-neutral-700 ${collapsible ? '' : '-mb-2'}`}>
      {shown.map((line, i) =>
        line.type === 'heading' ? (
          <li key={i} className="pb-1 pt-3">
            <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{line.value}</p>
          </li>
        ) : (
          <li key={i} className="py-1.5">
            {line.type === 'field' && <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{line.label}</p>}
            {/* The copy button sits right after the value, not at the far edge. */}
            <div className="flex min-w-0 items-center gap-1">
              <p className="min-w-0 whitespace-pre-wrap break-words text-[15px] text-neutral-900 dark:text-neutral-100">{line.value}</p>
              <div className="-my-2 flex-shrink-0">
                <CopyButton
                  value={copyValue(line.value)}
                  label={line.type === 'field' ? t('detail.copyField', 'Copy {{name}}', { name: line.label }) : t('detail.copyLine', 'Copy this line')}
                />
              </div>
            </div>
          </li>
        ),
      )}
    </ul>
    {collapsible && (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1 inline-flex min-h-8 items-center text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
      >
        {open ? t('items:detail.showLess', 'Show less') : t('items:detail.showAllCount', 'Show all ({{count}})', { count: rowCount })}
      </button>
    )}
    </>
  );
}

/** `/documents/:id` — one simple screen: title, notes (view → Edit inline), files. */
export default function DocumentDetail() {
  const { t } = useTranslation(['documents', 'common']);
  const canWrite = useCanWrite();
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
      <PageContainer>
        <SkeletonHeader action />
        <div className={COLUMNS}>
          <div>
            <Skeleton variant="line" height={16} width={100} className="mb-3" />
            <SkeletonCards count={2} className="grid-cols-2 sm:grid-cols-3 md:grid-cols-4" tileHeight={180} />
          </div>
          <Card>
            <CardBody>
              <Skeleton variant="line" height={16} width={80} />
              <Skeleton variant="line" width="90%" className="mt-3" />
              <Skeleton variant="line" width="60%" className="mt-2" />
            </CardBody>
          </Card>
        </div>
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

  const noteLines = parseNoteLines(doc.notes);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(doc.notes);
      toast.success(t('common:actions.copied', 'Copied'));
    } catch {
      toast.error(t('detail.copyFailed', 'Could not copy. Please try again.'));
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
      <DetailHeader
        breadcrumb={<FolderBreadcrumb path={where.path} />}
        title={doc.title}
        chip={{ icon: FileText, label: t('detail.kind', 'Document') }}
        menuLabel={t('detail.moreActions', 'More actions')}
        actions={
          <>
            <ShareButton targetType="document" targetId={doc.id} variant="icon" className="sm:hidden" />
            <span className="hidden sm:block">
              <ShareButton targetType="document" targetId={doc.id} size="sm" />
            </span>
          </>
        }
        menu={
          canWrite && (
            <>
              <DropdownItem onSelect={() => setMoveOpen(true)}>
                <span className="flex items-center gap-2"><FolderInput className="h-4 w-4" aria-hidden="true" />{t('common:actions.move', 'Move')}</span>
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem danger onSelect={() => setDeleteOpen(true)}>
                <span className="flex items-center gap-2"><Trash2 className="h-4 w-4" aria-hidden="true" />{t('common:actions.delete', 'Delete')}</span>
              </DropdownItem>
            </>
          )
        }
      />

      <div className={COLUMNS}>
      <div className="min-w-0 space-y-4 sm:space-y-6">
      <FileGallery document={doc} />

      <Card>
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
                <div className="flex items-center gap-1">
                  {noteLines.length > 0 && (
                    <Button variant="ghost" size="sm" leftIcon={<Copy className="h-4 w-4" />} onClick={copyAll}>
                      {t('detail.copyAll', 'Copy all')}
                    </Button>
                  )}
                  {canWrite && (
                    <Button variant="ghost" size="sm" leftIcon={<Pencil className="h-4 w-4" />} onClick={startEdit}>
                      {t('common:actions.edit', 'Edit')}
                    </Button>
                  )}
                </div>
              </div>
              {noteLines.length > 0 ? (
                <NoteLines lines={noteLines} />
              ) : (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('detail.noNotes', 'No notes yet.')}</p>
              )}
            </div>
          )}
        </CardBody>
      </Card>
      </div>
      <DetailAside
        kind="document"
        record={doc}
        folderPath={where.path}
        activity={canWrite ? { queryKey: ['documents', 'activity', doc.id, doc.updatedAt], queryFn: () => documentsApi.activity(doc.id) } : null}
      />
      </div>

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
