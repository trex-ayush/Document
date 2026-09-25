import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderPlus, LayoutGrid, List } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import Skeleton from '@/components/ui/Skeleton.jsx';
import { ErrorState } from '@/components/ui/PageState.jsx';
import { SECTION_TITLE, SEGMENT_TRACK, segmentItem } from '@/components/ui/tokens.js';
import FolderGrid, { FolderGridSkeleton } from '@/features/folders/FolderGrid.jsx';
import { BrowseListCard, FolderListRow } from '@/features/folders/BrowseRows.jsx';
import { sortFolders } from '@/features/folders/folderTreeUtils.js';
import { useBrowse } from '@/features/folders/foldersHooks.js';

/**
 * Home's "Folders" section: the family's top-level folders (same data and order as `/browse`),
 * shown as tiles or as a list. The choice is remembered on this device.
 */

const VIEW_KEY = 'home.folderView';

function readView() {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function saveView(view) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* private mode / storage blocked — the choice just isn't remembered */
  }
}

function ViewToggle({ view, onChange }) {
  const { t } = useTranslation('dashboard');
  const options = [
    { key: 'grid', icon: LayoutGrid, label: t('folders.grid', 'Grid') },
    { key: 'list', icon: List, label: t('folders.list', 'List') },
  ];
  return (
    <div
      role="group"
      aria-label={t('folders.viewLabel', 'Show folders as')}
      className={`inline-flex flex-shrink-0 gap-1 ${SEGMENT_TRACK}`}
    >
      {options.map(({ key, icon: Icon, label }) => {
        const active = view === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={label}
            onClick={() => onChange(key)}
            className={`flex min-h-10 min-w-10 items-center justify-center gap-2 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${segmentItem(active)}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="hidden sm:inline" aria-hidden="true">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function HomeFolders() {
  const { t } = useTranslation(['dashboard', 'browse', 'common']);
  const navigate = useNavigate();
  const [view, setView] = useState(readView);
  const { data, isLoading, isError } = useBrowse(undefined);
  const folders = useMemo(() => sortFolders(data?.folders || []), [data]);

  const changeView = (next) => {
    setView(next);
    saveView(next);
  };

  let body;
  if (isLoading) {
    body = view === 'grid' ? (
      <FolderGridSkeleton />
    ) : (
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={64} rounded="lg" />)}
      </div>
    );
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
  } else if (view === 'grid') {
    body = <FolderGrid folders={folders} />;
  } else {
    body = (
      <BrowseListCard>
        {folders.map((f) => <FolderListRow key={f.id} folder={f} showMenu={false} />)}
      </BrowseListCard>
    );
  }

  return (
    <section aria-labelledby="home-folders-title" className="mt-4 sm:mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="home-folders-title" className={`min-w-0 truncate ${SECTION_TITLE}`}>
          {t('folders.title', 'Folders')}
        </h2>
        <ViewToggle view={view} onChange={changeView} />
      </div>
      <div aria-busy={isLoading || undefined}>{body}</div>
    </section>
  );
}
