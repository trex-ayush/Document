import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FolderPlus } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import { SkeletonRows } from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { ErrorState } from '@/components/ui/PageState.jsx';
import { GROUP_LABEL } from '@/components/ui/tokens.js';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { AddButton } from '@/features/add/AddMenu.jsx';
import { search } from '@/services/searchApi.js';
import FolderFormModal from '@/features/folders/FolderFormModal.jsx';
import FolderGrid from '@/features/folders/FolderGrid.jsx';
import FolderSearch from '@/features/folders/FolderSearch.jsx';
import { siblingColors } from '@/features/folders/folderColors.js';
import FolderViewToggle, { readFolderView, saveFolderView } from '@/features/folders/FolderViewToggle.jsx';
import { useFolderActions } from '@/features/folders/useFolderActions.jsx';
import FolderActionsMenu from '@/features/folders/FolderActionsMenu.jsx';
import { BrowseListCard, DocumentListRow, FolderListRow, ItemListRow } from '@/features/folders/BrowseRows.jsx';
import { buildBrowseEntries, folderName, folderPathLabel, ROOT_ID } from '@/features/folders/folderTreeUtils.js';
import { foldersKeys, useBrowse } from '@/features/folders/foldersHooks.js';
import { useCanWrite } from '@/hooks/useCanWrite.js';

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
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading, error } = useBrowse(folderId);
  const notFound = [400, 404].includes(error?.response?.status);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState(readFolderView);
  const changeView = (next) => {
    setView(next);
    saveFolderView(next);
  };

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

  const { handlers: rowHandlers, dialogs: folderDialogs } = useFolderActions({ onDeleted: handleFolderDeleted });

  // At the top level the search box only narrows the folders by name (no server call).
  const needle = isRoot ? query.trim().toLocaleLowerCase() : '';
  const shownEntries = needle ? entries.filter((e) => folderName(e.data, t).toLocaleLowerCase().includes(needle)) : entries;
  const folderEntries = shownEntries.filter((e) => e.type === 'folder');
  // From every folder here (not only the search matches), so colours stay put while filtering.
  const colors = useMemo(() => siblingColors(entries.filter((e) => e.type === 'folder').map((e) => e.data)), [entries]);
  const otherEntries = shownEntries.filter((e) => e.type !== 'folder');

  const newFolderButton = canWrite && (
    <Button variant="secondary" onClick={() => setFolderFormOpen(true)} leftIcon={<FolderPlus className="h-4 w-4" aria-hidden="true" />}>
      {t('actions.newFolder', 'New folder')}
    </Button>
  );
  // Inside a folder on phones the header row is tight: New folder shows as an icon there.
  const newFolderCompact = canWrite && (
    <Button
      variant="secondary"
      onClick={() => setFolderFormOpen(true)}
      leftIcon={<FolderPlus className="h-4 w-4" aria-hidden="true" />}
      aria-label={t('actions.newFolder', 'New folder')}
      title={t('actions.newFolder', 'New folder')}
    >
      <span className="hidden sm:inline">{t('actions.newFolder', 'New folder')}</span>
    </Button>
  );
  // Nothing to search or re-arrange in an empty folder.
  const folderEmpty = !isRoot && !isLoading && !error && entries.length === 0;

  return (
    <PageContainer>
      {isRoot ? (
        <PageHeader
          title={t('title', 'Folders')}
          subtitle={t('rootSubtitle', 'Everything is kept in folders. “Shared” is for the whole family.')}
          actions={newFolderButton}
        />
      ) : (
        <PageHeader
          breadcrumb={
            <nav aria-label={t('breadcrumb.label', 'You are here')} className="flex flex-wrap items-center gap-x-1">
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
          }
          title={currentName || (isLoading ? '' : t('title', 'Folders'))}
          titleAddon={currentFolder && <FolderActionsMenu folder={currentFolder} align="left" {...wrapHandlers(rowHandlers, currentFolder)} />}
          actions={
            !notFound && (
              // One stable cluster: search · grid/list · New folder · + Add, the search growing to
              // the left. Phones: New folder and Add on the left, search and grid/list pinned
              // right; while the search is open New folder and Add step aside for it.
              <div className="flex items-center gap-2 max-sm:w-full">
                {!folderEmpty && (
                  <div className={`flex items-center gap-2 max-sm:ml-auto ${searchOpen ? 'max-sm:min-w-0 max-sm:flex-1' : ''}`}>
                    <FolderSearch
                      value={query}
                      onChange={setQuery}
                      open={searchOpen}
                      onOpenChange={setSearchOpen}
                      placeholder={currentName ? t('searchIn', 'Search in {{name}}', { name: currentName }) : t('searchHere', 'Search in this folder')}
                    />
                    <FolderViewToggle view={view} onChange={changeView} />
                  </div>
                )}
                <div className={`flex items-center gap-2 max-sm:order-first ${searchOpen ? 'max-sm:hidden' : ''}`}>
                  {newFolderCompact}
                  <AddButton folderId={folderId} />
                </div>
              </div>
            )
          }
        />
      )}

      {isRoot && entries.length > 0 && (
        <div className="mb-3 flex items-center gap-2 sm:mb-4">
          {/* Same controls as Home's folders (the page title above already says "Folders"). */}
          <p className={`min-w-0 truncate text-sm text-neutral-500 dark:text-neutral-400 ${searchOpen ? 'max-sm:sr-only' : ''}`}>
            {shownEntries.length === 1
              ? t('common:units.folder_one', '{{count}} folder', { count: 1 })
              : t('common:units.folder_other', '{{count}} folders', { count: shownEntries.length })}
          </p>
          <div className={`ml-auto flex flex-shrink-0 items-center gap-2 ${searchOpen ? 'max-sm:min-w-0 max-sm:flex-1' : ''}`}>
            <FolderSearch value={query} onChange={setQuery} open={searchOpen} onOpenChange={setSearchOpen} />
            <FolderViewToggle view={view} onChange={changeView} />
          </div>
        </div>
      )}

      {query.trim() && !isRoot ? (
        <FolderSearchResults q={query} folderId={folderId} />
      ) : isLoading ? (
        <SkeletonRows count={6} />
      ) : notFound ? (
        <EmptyState
          image="/assets/empty-documents.png"
          title={t('notFound.title', 'This folder isn’t here any more')}
          description={t('notFound.description', 'Someone may have moved it to the Bin. You can bring it back from the Bin.')}
          action={
            <>
              <Button variant="secondary" onClick={() => navigate('/bin')}>{t('notFound.openBin', 'Open the Bin')}</Button>
              <Button onClick={() => navigate('/browse', { replace: true })}>{t('notFound.action', 'Go to all folders')}</Button>
            </>
          }
        />
      ) : error ? (
        <ErrorState>{t('loadError', 'Could not load this folder.')}</ErrorState>
      ) : needle && shownEntries.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {t('dashboard:folders.noMatch', 'No folder called “{{q}}”.', { q: query.trim() })}
        </p>
      ) : entries.length === 0 ? (
        <EmptyState
          image="/assets/empty-documents.png"
          title={isRoot ? t('empty.rootTitle', 'No folders yet') : t('empty.folderTitle', 'This folder is empty')}
          description={
            isRoot
              ? t('empty.rootDescription', 'Make a folder for each person, like Papa or Mummy.')
              : canWrite
                ? t('empty.folderDescriptionAbove', 'Use “Add” above to put a document, password or note here.')
                : t('empty.folderDescriptionView', 'Nothing has been saved here yet.')
          }
          // No buttons here: "New folder" and "Add" are already in the page header.
        />
      ) : (
        <div className="space-y-4">
          {/* Grid view: folders as colour cards, then documents, passwords and notes as rows. */}
          {view === 'grid' && folderEntries.length > 0 && (
            <FolderGrid folders={folderEntries.map((e) => e.data)} colors={colors} handlers={rowHandlers} />
          )}
          {(view === 'list' ? shownEntries : otherEntries).length > 0 && (
            <BrowseListCard>
              {(view === 'list' ? shownEntries : otherEntries).map((entry) => {
                if (entry.type === 'folder') return <FolderListRow key={entry.key} folder={entry.data} colors={colors} {...rowHandlers} />;
                if (entry.type === 'document') return <DocumentListRow key={entry.key} doc={entry.data} />;
                return <ItemListRow key={entry.key} item={entry.data} />;
              })}
            </BrowseListCard>
          )}
        </div>
      )}

      <FolderFormModal
        isOpen={folderFormOpen}
        onClose={() => setFolderFormOpen(false)}
        parentId={folderId || ROOT_ID}
        parentName={currentName}
      />
      {folderDialogs}
    </PageContainer>
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
    return <SkeletonRows count={4} />;
  }
  if (isError) return <ErrorState>{t('search.error', 'Search failed. Please try again.')}</ErrorState>;

  const folders = data?.folders || [];
  const documents = data?.documents || [];
  const items = data?.items || [];
  if (!folders.length && !documents.length && !items.length) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
        {t('search.noResults', 'Nothing matches “{{q}}” in this folder.', { q: debounced })}
      </p>
    );
  }

  return (
    <div className={`space-y-4 transition-opacity sm:space-y-6 ${isFetching ? 'opacity-60' : ''}`}>
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
      <h2 className={`mb-2 ${GROUP_LABEL}`}>{title}</h2>
      <BrowseListCard>{children}</BrowseListCard>
    </section>
  );
}
