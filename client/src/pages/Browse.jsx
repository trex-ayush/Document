import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FolderPlus } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import Skeleton from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import SearchInput from '@/components/ui/SearchInput.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { AddButton } from '@/features/add/AddMenu.jsx';
import { search } from '@/services/searchApi.js';
import FolderFormModal from '@/features/folders/FolderFormModal.jsx';
import DeleteFolderModal from '@/features/folders/DeleteFolderModal.jsx';
import FolderPicker from '@/features/folders/FolderPicker.jsx';
import FolderActionsMenu from '@/features/folders/FolderActionsMenu.jsx';
import { BrowseListCard, DocumentListRow, FolderListRow, ItemListRow } from '@/features/folders/BrowseRows.jsx';
import { buildBrowseEntries, folderName, folderPathLabel, ROOT_ID } from '@/features/folders/folderTreeUtils.js';
import { foldersKeys, useBrowse, useUpdateFolder } from '@/features/folders/foldersHooks.js';

/**
 * Browse — `/browse` (top level: folders only) and `/browse/:folderId` (one folder: breadcrumb,
 * search inside this folder, "+ Folder", "+ Add", then one list — subfolders first, then
 * documents, passwords and notes, newest first).
 *
 * Works whether the router mounts it as `browse/*` or as `browse` + `browse/:folderId`.
 * `?newFolder=1` opens the new-folder form.
 */
export default function Browse() {
  const params = useParams();
  const folderId = params.folderId || (params['*'] || '').split('/')[0] || undefined;
  // Remount per folder so the in-folder search box starts empty in every folder.
  return <BrowseView key={folderId || ROOT_ID} folderId={folderId} />;
}

function BrowseView({ folderId }) {
  const { t } = useTranslation(['browse', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading, error } = useBrowse(folderId);
  const notFound = [400, 404].includes(error?.response?.status);
  const updateFolder = useUpdateFolder();

  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(null);
  const [movingFolder, setMovingFolder] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (searchParams.get('newFolder') === '1') {
      setFolderFormOpen(true);
      setSearchParams((sp) => { sp.delete('newFolder'); return sp; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const isRoot = !folderId;
  const currentFolder = notFound ? null : data?.folder || null;
  const currentName = currentFolder ? folderName(currentFolder, t) : '';
  const breadcrumbs = data?.breadcrumbs || [];
  const entries = useMemo(
    () => buildBrowseEntries({ folders: data?.folders, documents: isRoot ? [] : data?.documents, items: isRoot ? [] : data?.items }),
    [data, isRoot],
  );

  // Deleting the folder you're standing in: step back up to its parent (it's in the Bin now).
  const handleFolderDeleted = (deleted) => {
    if (!deleted || deleted.id !== folderId) return;
    navigate(deleted.parentId && deleted.parentId !== ROOT_ID ? `/browse/${deleted.parentId}` : '/browse', { replace: true });
    queryClient.removeQueries({ queryKey: foldersKeys.browse(deleted.id) });
  };

  const handleFolderMove = (targetFolderId) => {
    if (!movingFolder || !targetFolderId) return;
    const name = folderName(movingFolder, t);
    updateFolder.mutate(
      { id: movingFolder.id, parentId: targetFolderId },
      {
        onSuccess: () => toast.success(t('toasts.folderMoved', 'Moved “{{name}}”', { name })),
        onError: (err) => toast.error(err?.response?.data?.message || t('toasts.folderMoveFailed', 'Could not move the folder')),
      },
    );
  };

  const rowHandlers = { onRename: setEditingFolder, onMove: setMovingFolder, onDelete: setDeletingFolder };
  const newFolderButton = (
    <Button variant="secondary" onClick={() => setFolderFormOpen(true)} leftIcon={<FolderPlus className="h-4 w-4" aria-hidden="true" />}>
      {t('actions.newFolder', 'New folder')}
    </Button>
  );

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24 sm:p-6">
      {isRoot ? (
        <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 sm:text-2xl">{t('title', 'Folders')}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {t('rootSubtitle', 'Everything is kept in folders. “Shared” is for the whole family.')}
            </p>
          </div>
          <div className="flex-shrink-0">{newFolderButton}</div>
        </div>
      ) : (
        <div className="mb-4 sm:mb-5">
          <nav aria-label={t('breadcrumb.label', 'You are here')} className="mb-1 flex flex-wrap items-center gap-x-1 text-sm text-neutral-500 dark:text-neutral-400">
            <Link to="/browse" className="hover:text-neutral-800 hover:underline dark:hover:text-neutral-200">{t('title', 'Folders')}</Link>
            {breadcrumbs.map((b, i) => (
              <span key={b.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                {i === breadcrumbs.length - 1 ? (
                  <span aria-current="page" className="truncate font-medium text-neutral-700 dark:text-neutral-200">{folderName(b, t)}</span>
                ) : (
                  <Link to={`/browse/${b.id}`} className="truncate hover:text-neutral-800 hover:underline dark:hover:text-neutral-200">{folderName(b, t)}</Link>
                )}
              </span>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <h1 className="min-w-0 break-words text-xl font-bold text-neutral-900 dark:text-neutral-100 sm:text-2xl">
              {currentName || (isLoading ? '' : t('title', 'Folders'))}
            </h1>
            {currentFolder && <FolderActionsMenu folder={currentFolder} align="left" {...wrapHandlers(rowHandlers, currentFolder)} />}
          </div>
        </div>
      )}

      {!isRoot && !notFound && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            size="md"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery('')}
            placeholder={currentName ? t('searchIn', 'Search in {{name}}', { name: currentName }) : t('searchHere', 'Search in this folder')}
            wrapperClassName="min-w-0 flex-1"
          />
          <div className="flex gap-2">
            {newFolderButton}
            <AddButton folderId={folderId} />
          </div>
        </div>
      )}

      {query.trim() && !isRoot ? (
        <FolderSearchResults q={query} folderId={folderId} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={56} rounded="lg" />)}
        </div>
      ) : notFound ? (
        <EmptyState
          image="/assets/empty-documents.png"
          title={t('notFound.title', 'This folder isn’t here any more')}
          description={t('notFound.description', 'Someone may have moved it to the Bin. You can bring it back from the Bin.')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate('/browse', { replace: true })}>{t('notFound.action', 'Go to all folders')}</Button>
              <Button variant="secondary" onClick={() => navigate('/bin')}>{t('notFound.openBin', 'Open the Bin')}</Button>
            </div>
          }
        />
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-600 dark:text-red-400">{t('loadError', 'Could not load this folder.')}</p>
      ) : entries.length === 0 ? (
        <EmptyState
          image="/assets/empty-documents.png"
          title={isRoot ? t('empty.rootTitle', 'No folders yet') : t('empty.folderTitle', 'This folder is empty')}
          description={isRoot ? t('empty.rootDescription', 'Make a folder for each person, like Papa or Mummy.') : t('empty.folderDescription', 'Tap “Add” to put a document, password or note here.')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {!isRoot && <AddButton folderId={folderId} align="left" />}
              {newFolderButton}
            </div>
          }
        />
      ) : (
        <BrowseListCard>
          {entries.map((entry) => {
            if (entry.type === 'folder') return <FolderListRow key={entry.key} folder={entry.data} {...rowHandlers} />;
            if (entry.type === 'document') return <DocumentListRow key={entry.key} doc={entry.data} />;
            return <ItemListRow key={entry.key} item={entry.data} />;
          })}
        </BrowseListCard>
      )}

      <FolderFormModal
        isOpen={folderFormOpen}
        onClose={() => setFolderFormOpen(false)}
        parentId={folderId || ROOT_ID}
        parentName={currentName}
      />
      <FolderFormModal isOpen={Boolean(editingFolder)} onClose={() => setEditingFolder(null)} folder={editingFolder} />
      <DeleteFolderModal
        isOpen={Boolean(deletingFolder)}
        onClose={() => setDeletingFolder(null)}
        folder={deletingFolder}
        onDeleted={handleFolderDeleted}
      />
      <FolderPicker
        isOpen={Boolean(movingFolder)}
        onClose={() => setMovingFolder(null)}
        onPick={handleFolderMove}
        excludeFolderId={movingFolder?.id}
        allowRoot
        title={t('movePicker.title', 'Move “{{name}}”', { name: movingFolder ? folderName(movingFolder, t) : '' })}
      />
    </div>
  );
}

/** Row handlers take the folder; the header menu's handlers take nothing. */
function wrapHandlers({ onRename, onMove, onDelete }, folder) {
  return { onRename: () => onRename(folder), onMove: () => onMove(folder), onDelete: () => onDelete(folder) };
}

/** Results of the in-folder search box: this folder and every folder inside it. */
function FolderSearchResults({ q, folderId }) {
  const { t } = useTranslation(['browse', 'common']);
  const debounced = useDebouncedValue(q.trim(), 250);
  const { data, isFetching, isError } = useQuery({
    queryKey: ['search', 'folder', folderId, debounced],
    queryFn: ({ signal }) => search({ q: debounced, folderId, limit: 50 }, { signal }),
    enabled: Boolean(debounced),
    placeholderData: (prev) => prev,
  });

  if (!debounced || (!data && isFetching)) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (isError) return <p className="py-10 text-center text-sm text-red-600 dark:text-red-400">{t('search.error', 'Search failed. Please try again.')}</p>;

  const folders = data?.folders || [];
  const documents = data?.documents || [];
  const items = data?.items || [];
  if (!folders.length && !documents.length && !items.length) {
    return (
      <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
        {t('search.noResults', 'Nothing matches “{{q}}” in this folder.', { q: debounced })}
      </p>
    );
  }

  return (
    <div className={`space-y-5 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
      {folders.length > 0 && (
        <ResultGroup title={t('search.folders', 'Folders')}>
          {folders.map((f) => <FolderListRow key={f.id} folder={f} meta={folderPathLabel(f.path, t)} showMenu={false} />)}
        </ResultGroup>
      )}
      {documents.length > 0 && (
        <ResultGroup title={t('search.documents', 'Documents')}>
          {documents.map((d) => <DocumentListRow key={d.id} doc={d} meta={folderPathLabel(d.path, t)} snippet={d.snippet} />)}
        </ResultGroup>
      )}
      {items.length > 0 && (
        <ResultGroup title={t('search.items', 'Passwords and notes')}>
          {items.map((i) => <ItemListRow key={i.id} item={i} meta={folderPathLabel(i.path, t)} snippet={i.snippet} />)}
        </ResultGroup>
      )}
    </div>
  );
}

function ResultGroup({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{title}</h2>
      <BrowseListCard>{children}</BrowseListCard>
    </section>
  );
}
