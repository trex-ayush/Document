import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import { ListIcon, ListRow } from '@/components/ui/ListRow.jsx';
import { useIsMobile } from '@/hooks/useIsMobile.js';
import { useClickOutside } from '@/hooks/useClickOutside.js';
import { Plus } from 'lucide-react';
import { useCanWrite } from '@/hooks/useCanWrite.js';
import { ADD_OPTIONS, addPath } from './addOptions.js';

/**
 * "+ Add" — the one way to add something: Upload document, Take photo, Save password,
 * Write note. Each option opens its add page, carrying `folderId` when given (and
 * `capture=1` for the camera).
 *
 * - `AddButton({ folderId?, className?, align? })` — a primary button. PC: a small popover
 *   under the button (`align` 'right' (default) | 'left'). Phone: a bottom sheet.
 * - `AddMenuSheet({ isOpen, onClose, folderId? })` — just the phone bottom sheet, for
 *   triggers that aren't a button (the bottom tab bar's centre "+ Add").
 */

function OptionRow({ option, onSelect, compact, role }) {
  const { t } = useTranslation('common');
  return (
    <ListRow
      compact={compact}
      onClick={() => onSelect(option.key)}
      mainProps={{ role }}
      icon={<ListIcon icon={option.icon} kind="folder" />}
      title={t(option.labelKey, option.label)}
      meta={t(option.hintKey, option.hint)}
    />
  );
}

function useAddNavigate(folderId, onDone) {
  const navigate = useNavigate();
  return useCallback(
    (key) => {
      onDone?.();
      navigate(addPath(key, folderId));
    },
    [navigate, folderId, onDone],
  );
}

export function AddMenuSheet({ isOpen, onClose, folderId }) {
  const { t } = useTranslation('common');
  const select = useAddNavigate(folderId, onClose);
  return (
    <Drawer isOpen={isOpen} onClose={onClose} side="right" size="sm" title={t('addMenu.title', 'What do you want to add?')} bodyClassName="py-2">
      <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
        {ADD_OPTIONS.map((option) => (
          <OptionRow key={option.key} option={option} onSelect={select} />
        ))}
      </div>
    </Drawer>
  );
}

export function AddButton({ folderId, className = '', align = 'right' }) {
  const { t } = useTranslation('common');
  const isMobile = useIsMobile();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  const select = useAddNavigate(folderId, close);

  useClickOutside(wrapperRef, close, open && !isMobile);

  useEffect(() => {
    if (!open || isMobile) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isMobile]);

  // View-only members can't add anything.
  if (!canWrite) return null;

  return (
    <div ref={wrapperRef} className={`relative inline-flex ${className}`}>
      <Button
        onClick={() => setOpen((v) => !v)}
        leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open && !isMobile ? menuId : undefined}
      >
        {t('addMenu.button', 'Add')}
      </Button>

      {open && !isMobile && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('addMenu.title', 'What do you want to add?')}
          className={`absolute top-full z-30 mt-2 w-72 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-dropdown animate-scale-in dark:border-neutral-700 dark:bg-neutral-800 ${
            align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right'
          }`}
        >
          {ADD_OPTIONS.map((option) => (
            <OptionRow key={option.key} option={option} onSelect={select} compact role="menuitem" />
          ))}
        </div>
      )}

      {isMobile && <AddMenuSheet isOpen={open} onClose={close} folderId={folderId} />}
    </div>
  );
}
