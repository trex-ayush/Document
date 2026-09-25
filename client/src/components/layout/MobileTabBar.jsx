import { useState } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AddMenuSheet } from '@/features/add/AddMenu.jsx';
import { TAB_ITEMS } from './navConfig.js';
import { Ellipsis, Plus } from 'lucide-react';

/**
 * MobileTabBar — fixed bottom bar below `lg`: Home · Folders · + Add · Search · More.
 * "+ Add" opens the add sheet (carrying the open folder when you're inside one);
 * "More" opens the drawer with everything else (`onOpenMore`).
 * Hidden while the on-screen keyboard is open (`hide-with-keyboard`, index.css) so it
 * never covers the form being filled in.
 */
const tabClass = (isActive) =>
  `flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[52px] text-[11px] font-medium ${
    isActive ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-500 dark:text-neutral-400'
  }`;

function Tab({ item }) {
  const { t } = useTranslation('common');
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => tabClass(isActive)}>
      <item.icon className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
      <span>{t(item.labelKey, item.label)}</span>
    </NavLink>
  );
}

export default function MobileTabBar({ onOpenMore }) {
  const { t } = useTranslation('common');
  const [addOpen, setAddOpen] = useState(false);
  const folderMatch = useMatch('/browse/:folderId');
  const folderId = folderMatch?.params?.folderId;
  const [home, folders, search] = TAB_ITEMS;

  return (
    <>
      <nav
        className="hide-with-keyboard lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 pb-[var(--safe-bottom)]"
        aria-label={t('nav.primary', 'Main')}
      >
        <div className="grid grid-cols-5">
          <Tab item={home} />
          <Tab item={folders} />
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-haspopup="dialog"
            className="flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[52px] text-[11px] font-medium text-neutral-700 dark:text-neutral-200"
          >
            <span className="flex h-7 w-10 items-center justify-center rounded-lg bg-primary-500 text-white shadow-sm">
              <Plus className="w-5 h-5" strokeWidth={2.25} aria-hidden="true" />
            </span>
            <span>{t('addMenu.button', 'Add')}</span>
          </button>
          <Tab item={search} />
          <button type="button" onClick={onOpenMore} className={tabClass(false)}>
            <Ellipsis className="w-5 h-5" aria-hidden="true" />
            <span>{t('nav.more', 'More')}</span>
          </button>
        </div>
      </nav>
      <AddMenuSheet isOpen={addOpen} onClose={() => setAddOpen(false)} folderId={folderId} />
    </>
  );
}
