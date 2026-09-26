import { useState } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AddMenuSheet } from '@/features/add/AddMenu.jsx';
import { TAB_ITEMS } from './navConfig.js';
import { Ellipsis, Plus } from 'lucide-react';
import { useCanWrite } from '@/hooks/useCanWrite.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

// Tooltips here only show on a tablet with a mouse or a keyboard; a phone tap never shows them.
const TIP_WRAP = 'grid';

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
    <Tooltip content={t(item.tipKey, item.tip)} className={TIP_WRAP}>
      <NavLink to={item.to} end={item.end} className={({ isActive }) => tabClass(isActive)}>
        <item.icon className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        <span>{t(item.labelKey, item.label)}</span>
      </NavLink>
    </Tooltip>
  );
}

export default function MobileTabBar({ onOpenMore }) {
  const { t } = useTranslation('common');
  const [addOpen, setAddOpen] = useState(false);
  const folderMatch = useMatch('/browse/:folderId');
  const folderId = folderMatch?.params?.folderId;
  const [home, folders, search] = TAB_ITEMS;
  const canWrite = useCanWrite();

  return (
    <>
      <nav
        className="hide-with-keyboard lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 pb-[var(--safe-bottom)]"
        aria-label={t('nav.primary', 'Main')}
      >
        {/* View-only members have nothing to add, so their bar has four tabs. */}
        <div className={`grid ${canWrite ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <Tab item={home} />
          <Tab item={folders} />
          {canWrite && (
          <Tooltip content={t('tip.addNew', 'Add a file, password or note')} className={TIP_WRAP}>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-haspopup="dialog"
            aria-label={t('addMenu.button', 'Add')}
            className="group flex min-h-[52px] flex-col items-center justify-end gap-0.5 pb-1.5 text-[11px] font-medium text-neutral-700 focus-visible:outline-none dark:text-neutral-200"
          >
            {/* A round coral button raised over the bar's top edge; the white ring separates it from the bar. */}
            <span className="-mt-6 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary-500 text-white shadow-lg shadow-primary-500/30 ring-4 ring-white transition-transform group-active:scale-95 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary-500 dark:ring-neutral-800">
              <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span aria-hidden="true">{t('addMenu.button', 'Add')}</span>
          </button>
          </Tooltip>
          )}
          <Tab item={search} />
          <Tooltip content={t('tip.nav.more', 'More pages and settings')} className={TIP_WRAP}>
            <button type="button" onClick={onOpenMore} className={tabClass(false)}>
              <Ellipsis className="w-5 h-5" aria-hidden="true" />
              <span>{t('nav.more', 'More')}</span>
            </button>
          </Tooltip>
        </div>
      </nav>
      <AddMenuSheet isOpen={addOpen} onClose={() => setAddOpen(false)} folderId={folderId} />
    </>
  );
}
