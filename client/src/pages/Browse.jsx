import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Button from '@/components/ui/Button.jsx';
import ViewModeToggle from '@/components/ui/ViewModeToggle.jsx';
import Skeleton from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { useIsMobile } from '@/hooks/useIsMobile.js';
import { useLocalStorageState } from '@/hooks/useLocalStorageState.js';
import { useAppShell } from '@/components/layout/AppShell.jsx';
import FolderTree from '@/features/folders/FolderTree.jsx';
import FolderCard from '@/features/folders/FolderCard.jsx';
import FolderRow from '@/features/folders/FolderRow.jsx';
import FolderFormModal from '@/features/folders/FolderFormModal.jsx';
import DeleteFolderModal from '@/features/folders/DeleteFolderModal.jsx';
import FolderPicker from '@/features/folders/FolderPicker.jsx';
import { useBrowse, useFolderTree, useFolderZip, useUpdateFolder } from '@/features/folders/foldersHooks.js';
import DocumentCard from '@/features/documents/DocumentCard.jsx';
import DocumentRow from '@/features/documents/DocumentRow.jsx';
import UploadModal from '@/features/documents/UploadModal.jsx';
import { downloadZipFrom } from '@/features/documents/zipDownload.js';
import ItemCard from '@/features/items/ItemCard.jsx';
import CommandPalette from '@/features/search/CommandPalette.jsx';

const SORTERS = {
  name: (a, b, kind) => (kind === 'folder' ? a.name.localeCompare(b.name) : a.title.localeCompare(b.title)),
  date: (a, b, kind) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
  // DocumentSummary/Folder don't carry a byte size (docs/API.md) — file/child
  // count is the closest available proxy. Documented deviation, see this
  // agent's final report ("Browse" section).
  size: (a, b, kind) => (kind === 'folder' ? (b.documentCount + b.folderCount) - (a.documentCount + a.folderCount) : (b.fileCount || 0) - (a.fileCount || 0)),
};

/** Route element for `browse/*` — nested `<Routes>` for `/browse` (root) and `/browse/:folderId`. */
export default function Browse() {
  return (
    <Routes>
      <Route path="/" element={<BrowseView />} />
      <Route path=":folderId" element={<BrowseView />} />
    </Routes>
  );
}

function BrowseView() {
  const { t } = useTranslation(['browse', 'common']);
  const { folderId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { setSidebarSlot } = useAppShell();
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewMode, setViewMode] = useLocalStorageState('family-vault-browse-view', 'grid');
  const [sortBy, setSortBy] = useLocalStorageState('family-vault-browse-sort', 'name');

  const { data, isLoading } = useBrowse(folderId);
  const { data: treeData } = useFolderTree();
  const updateFolder = useUpdateFolder();
  const folderZip = useFolderZip();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCapture, setUploadCapture] = useState(false);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(null);
  const [movingFolder, setMovingFolder] = useState(null);

  // FAB query-param convention (docs/UI_KIT.md §7.6 / §9): `?upload=1`,
  // `?upload=1&capture=1`, `?newFolder=1`. Consumed once on mount, then
  // stripped so navigating back here doesn't reopen the flow.
  useEffect(() => {
    if (searchParams.get('upload') === '1') {
      setUploadCapture(searchParams.get('capture') === '1');
      setUploadOpen(true);
      setSearchParams((sp) => { sp.delete('upload'); sp.delete('capture'); return sp; }, { replace: true });
    } else if (searchParams.get('newFolder') === '1') {
      setFolderFormOpen(true);
      setSearchParams((sp) => { sp.delete('newFolder'); return sp; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop sidebar folder-tree slot (docs/UI_KIT.md §7.1). Mobile renders
  // its own inline tree below instead — no room for it in the tab-bar layout.
  useEffect(() => {
    if (isMobile) {
      setSidebarSlot(null);
      return undefined;
    }
    setSidebarSlot(
      <FolderTree
        folders={treeData?.items || []}
        activeId={folderId || null}
        onSelect={(id) => navigate(id ? `/browse/${id}` : '/browse')}
        className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800"
      />,
    );
    return () => setSidebarSlot(null);
  }, [isMobile, treeData, folderId, navigate, setSidebarSlot]);

  const folders = useMemo(() => [...(data?.folders || [])].sort((a, b) => SORTERS[sortBy](a, b, 'folder')), [data, sortBy]);
  const documents = useMemo(() => [...(data?.documents || [])].sort((a, b) => SORTERS[sortBy](a, b, 'document')), [data, sortBy]);
  const items = data?.items || [];
  const breadcrumbs = data?.breadcrumbs || [];
  const totalCount = folders.length + documents.length + items.length;

  const openFolder = (folder) => navigate(`/browse/${folder.id}`);
  const handleFolderSaved = () => setEditingFolder(null);
  const handleFolderMove = (targetFolderId) => {
    if (!movingFolder) return;
    updateFolder.mutate(
      { id: movingFolder.id, parentId: targetFolderId },
      {
        onSuccess: () => toast.success(t('toasts.folderMoved', 'Moved "{{name}}"', { name: movingFolder.name })),
        onError: (err) => toast.error(err?.response?.data?.message || t('toasts.folderMoveFailed', 'Could not move the folder')),
      },
    );
  };
  const handleFolderZip = (folder) => downloadZipFrom(folderZip.mutateAsync(folder.id), `${folder.name}.zip`);

  return (
    <div className="p-4 pb-24 sm:p-6">
      <PageHeader
        title={data?.folder?.name || t('title', 'Browse')}
        subtitle={
          isLoading
            ? undefined
            : totalCount === 1
              ? t('common:units.item_one', '{{count}} item', { count: totalCount })
              : t('common:units.item_other', '{{count}} items', { count: totalCount })
        }
        breadcrumb={
          <nav className="flex flex-wrap items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
            <button type="button" onClick={() => navigate('/browse')} className="hover:underline">{t('allFolders', 'All folders')}</button>
            {breadcrumbs.map((b) => (
              <span key={b.id} className="flex items-center gap-1">
                <span>/</span>
                <button type="button" onClick={() => navigate(`/browse/${b.id}`)} className="hover:underline">{b.name}</button>
              </span>
            ))}
          </nav>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-10 rounded-lg border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              aria-label={t('sort.label', 'Sort by')}
            >
              <option value="name">{t('sort.name', 'Name')}</option>
              <option value="date">{t('sort.date', 'Date')}</option>
              <option value="size">{t('sort.size', 'Size')}</option>
            </select>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            {data?.folder && (
              <Button variant="secondary" onClick={() => handleFolderZip(data.folder)}>{t('actions.zip', 'ZIP')}</Button>
            )}
            <Button variant="secondary" onClick={() => setFolderFormOpen(true)}>{t('actions.newFolder', '+ Folder')}</Button>
            <Button onClick={() => { setUploadCapture(false); setUploadOpen(true); }}>{t('actions.upload', '+ Upload')}</Button>
          </div>
        }
      />

      {isMobile && (
        <div className="mt-4 rounded-xl border border-neutral-200 p-2 dark:border-neutral-700">
          <FolderTree
            folders={treeData?.items || []}
            activeId={folderId || null}
            onSelect={(id) => navigate(id ? `/browse/${id}` : '/browse')}
          />
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4' : 'space-y-1'}>
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={viewMode === 'grid' ? 140 : 56} rounded="lg" />)}
          </div>
        ) : totalCount === 0 ? (
          <EmptyState
            title={t('common:empty.title', 'Nothing here yet')}
            description={t('empty.description', 'Create a folder or upload your first document.')}
            action={<Button onClick={() => setUploadOpen(true)}>{t('empty.action', 'Upload a document')}</Button>}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {folders.map((f) => (
              <FolderCard
                key={f.id}
                folder={f}
                onOpen={openFolder}
                onRename={setEditingFolder}
                onMove={setMovingFolder}
                onDownloadZip={handleFolderZip}
                onDelete={setDeletingFolder}
              />
            ))}
            {documents.map((d) => (
              <DocumentCard key={d.id} doc={d} onOpen={(doc) => navigate(`/document/${doc.id}`)} />
            ))}
            {items.map((item) => <ItemCard key={item.id} item={item} />)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
            {folders.map((f) => (
              <FolderRow
                key={f.id}
                folder={f}
                onOpen={openFolder}
                onRename={setEditingFolder}
                onMove={setMovingFolder}
                onDownloadZip={handleFolderZip}
                onDelete={setDeletingFolder}
              />
            ))}
            {documents.map((d) => (
              <DocumentRow key={d.id} doc={d} onOpen={(doc) => navigate(`/document/${doc.id}`)} />
            ))}
            {items.map((item) => <ItemCard key={item.id} item={item} />)}
          </div>
        )}
      </div>

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        mode="create"
        defaultFolderId={folderId || null}
        autoCapture={uploadCapture}
        onCreated={(doc) => navigate(`/document/${doc.id}`)}
      />
      <FolderFormModal
        isOpen={folderFormOpen}
        onClose={() => setFolderFormOpen(false)}
        parentId={folderId || 'root'}
        onSaved={() => {}}
      />
      <FolderFormModal
        isOpen={Boolean(editingFolder)}
        onClose={() => setEditingFolder(null)}
        folder={editingFolder}
        onSaved={handleFolderSaved}
      />
      <DeleteFolderModal
        isOpen={Boolean(deletingFolder)}
        onClose={() => setDeletingFolder(null)}
        folder={deletingFolder}
        onDeleted={() => {}}
      />
      <FolderPicker
        isOpen={Boolean(movingFolder)}
        onClose={() => setMovingFolder(null)}
        onPick={handleFolderMove}
        excludeFolderId={movingFolder?.id}
        title={t('movePicker.title', 'Move "{{name}}"', { name: movingFolder?.name })}
      />

      <CommandPalette />
    </div>
  );
}
