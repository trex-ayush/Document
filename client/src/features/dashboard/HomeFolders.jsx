import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderPlus } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { SkeletonRows } from '@/components/ui/Skeleton.jsx';
import { ErrorState } from '@/components/ui/PageState.jsx';
import { SECTION_TITLE } from '@/components/ui/tokens.js';
import FolderGrid, { FolderGridSkeleton } from '@/features/folders/FolderGrid.jsx';
import FolderSearch from '@/features/folders/FolderSearch.jsx';
import FolderViewToggle, { readFolderView, saveFolderView } from '@/features/folders/FolderViewToggle.jsx';
import { BrowseListCard, FolderListRow } from '@/features/folders/BrowseRows.jsx';
import { folderName, sortFolders } from '@/features/folders/folderTreeUtils.js';
import { useBrowse } from '@/features/folders/foldersHooks.js';
import { useFolderActions } from '@/features/folders/useFolderActions.jsx';
import { siblingColors } from '@/features/folders/folderColors.js';

/**
 * Home's "Folders" section: "Folders (n)", a search box that narrows them by name, and the
 * grid/list switch; then the family's top-level folders (same data and order as `/browse`) as
 * colour cards or rows, each with its ⋮ menu. The grid/list choice is remembered on this device.
 */
export default function HomeFolders() {
  const { t } = useTranslation(['dashboard', 'browse', 'common']);
  const navigate = useNavigate();
  const [view, setView] = useState(readFolderView);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const { data, isLoading, isError } = useBrowse(undefined);
  const folders = useMemo(() => sortFolders(data?.folders || []), [data]);
  // From all folders, not just the ones the search leaves, so colours don't change while filtering.
  const colors = useMemo(() => siblingColors(folders), [folders]);
  const { handlers, dialogs } = useFolderActions();

  // The search box only narrows these folders by name — no server call.
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle ? folders.filter((f) => folderName(f, t).toLocaleLowerCase().includes(needle)) : folders;

  const changeView = (next) => {
    setView(next);
    saveFolderView(next);
  };

  let body;
  if (isLoading) {
    body = view === 'grid' ? <FolderGridSkeleton /> : <SkeletonRows count={4} />;
  } else if (isError) {
    body = <ErrorState>{t('folders.loadError', 'Could not load your folders. Please refresh the page.')}</ErrorState>;
  } else if (folders.length === 0) {
    body = (
      <EmptyState
        size="sm"
        title={t('folders.emptyTitle', 'No folders yet')}
        description={t('folders.emptyDescription', 'Make a folder for each person, like Papa or Mummy.')}
        action={
          <Button variant="secondary" onClick={() => navigate('/browse?newFolder=1')} leftIcon={<FolderPlus className="h-4 w-4" aria-hidden="true" />}>
            {t('folders.newFolder', 'New folder')}
          </Button>
        }
      />
    );
  } else if (shown.length === 0) {
    body = (
      <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
        {t('folders.noMatch', 'No folder called “{{q}}”.', { q: query.trim() })}
      </p>
    );
  } else if (view === 'grid') {
    body = <FolderGrid folders={shown} colors={colors} handlers={handlers} />;
  } else {
    body = (
      <BrowseListCard>
        {shown.map((f) => <FolderListRow key={f.id} folder={f} colors={colors} {...handlers} />)}
      </BrowseListCard>
    );
  }

  return (
    <section aria-labelledby="home-folders-title" className="mt-4 sm:mt-6">
      {/* Title on the left, controls always on the right; on phones an open search takes the title's place. */}
      <div className="mb-3 flex items-center gap-2 sm:gap-3">
        <h2 id="home-folders-title" className={`min-w-0 truncate ${SECTION_TITLE} ${searchOpen ? 'max-sm:sr-only' : ''}`}>
          {t('folders.title', 'Folders')}
          {!isLoading && folders.length > 0 && (
            <span className="ml-1.5 font-normal text-neutral-500 dark:text-neutral-400">({shown.length})</span>
          )}
        </h2>
        <div className={`ml-auto flex flex-shrink-0 items-center gap-2 ${searchOpen ? 'max-sm:min-w-0 max-sm:flex-1' : ''}`}>
          {folders.length > 0 && <FolderSearch value={query} onChange={setQuery} open={searchOpen} onOpenChange={setSearchOpen} />}
          <FolderViewToggle view={view} onChange={changeView} />
        </div>
      </div>
      <div aria-busy={isLoading || undefined}>{body}</div>
      {dialogs}
    </section>
  );
}
