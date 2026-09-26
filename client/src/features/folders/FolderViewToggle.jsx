import { useTranslation } from 'react-i18next';
import { LayoutGrid, List } from 'lucide-react';

const VIEW_KEY = 'home.folderView';

/** The grid/list choice, remembered on this device (shared by Home and Browse). */
export function readFolderView() {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function saveFolderView(view) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* private mode / storage blocked — the choice just isn't remembered */
  }
}

/** Grid / list switch: two 40px icon buttons; the active one is a filled coral square. */
export default function FolderViewToggle({ view, onChange }) {
  const { t } = useTranslation('dashboard');
  const options = [
    { key: 'grid', icon: LayoutGrid, label: t('folders.grid', 'Grid') },
    { key: 'list', icon: List, label: t('folders.list', 'List') },
  ];
  return (
    <div
      role="group"
      aria-label={t('folders.viewLabel', 'Show folders as')}
      className="inline-flex flex-shrink-0 gap-0.5 rounded-xl bg-neutral-100 p-0.5 dark:bg-neutral-800"
    >
      {options.map(({ key, icon: Icon, label }) => {
        const active = view === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(key)}
            className={`flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              active
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-neutral-500 hover:bg-white hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100'
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
