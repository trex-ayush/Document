import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Drawer from '@/components/ui/Drawer.jsx';
import { useIsMobile } from '@/hooks/useIsMobile.js';
import { useClickOutside } from '@/hooks/useClickOutside.js';
import { CameraIcon, CloseIcon, FolderPlusIcon, HashIcon, KeyIcon, NoteIcon, PlusIcon, UploadIcon } from './icons.jsx';

/**
 * Fab — floating "+" action button (build-plan requirement). Desktop/tablet:
 * an upward popover menu anchored above the button. Mobile: a bottom sheet
 * (via the `Drawer` primitive, `side="bottom"`) with full-height rows for
 * easy thumb reach.
 *
 * Six actions:
 *  - Upload file / Take photo / New folder — no owning page exists yet
 *    (Browse is a later-phase page). Navigates to `/browse` with a
 *    query-param convention (`?upload=1`, `?upload=1&capture=1`,
 *    `?newFolder=1`) — documented in docs/UI_KIT.md and this agent's final
 *    report — for Browse to read on mount and open the matching flow.
 *  - Add password/login, Add number/record, Add secure note — navigate to
 *    the Items module's own routes exactly as specified:
 *    `/items/new?kind=login|record|note` (client/src/pages/items/ItemsRoutes.jsx).
 *
 * No props — reads nothing but the router; safe to mount once in AppShell.
 */
const ACTIONS = [
  { key: 'upload', label: 'Upload file', icon: UploadIcon, to: '/browse?upload=1' },
  { key: 'photo', label: 'Take photo', icon: CameraIcon, to: '/browse?upload=1&capture=1' },
  { key: 'folder', label: 'New folder', icon: FolderPlusIcon, to: '/browse?newFolder=1' },
  { key: 'login', label: 'Add password/login', icon: KeyIcon, to: '/items/new?kind=login' },
  { key: 'record', label: 'Add number/record', icon: HashIcon, to: '/items/new?kind=record' },
  { key: 'note', label: 'Add secure note', icon: NoteIcon, to: '/items/new?kind=note' },
];

export default function Fab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false), open && !isMobile);

  const go = (to) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <>
      <div ref={ref} className="fixed z-30 right-4 bottom-[calc(4.5rem+var(--safe-bottom))] lg:right-6 lg:bottom-6">
        {open && !isMobile && (
          <div className="absolute bottom-full right-0 mb-3 w-64 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-dropdown overflow-hidden animate-scale-in origin-bottom-right">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => go(a.to)}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
              >
                <a.icon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                {a.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close quick actions' : 'Add to vault'}
          aria-expanded={open}
          aria-haspopup="menu"
          className="w-14 h-14 rounded-full bg-primary-500 hover:bg-primary-600 text-white shadow-soft-md flex items-center justify-center transition-transform active:scale-95"
        >
          {open && !isMobile ? <CloseIcon className="w-6 h-6" /> : <PlusIcon className="w-6 h-6" />}
        </button>
      </div>

      {isMobile && (
        <Drawer isOpen={open} onClose={() => setOpen(false)} side="bottom" size="md" title="Add to vault">
          <div className="-mx-5 -my-2">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => go(a.to)}
                className="w-full flex items-center gap-3 px-5 py-3.5 min-h-[52px] text-sm font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
              >
                <span className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                  <a.icon className="w-4 h-4 text-neutral-500 dark:text-neutral-300" />
                </span>
                {a.label}
              </button>
            ))}
          </div>
        </Drawer>
      )}
    </>
  );
}
