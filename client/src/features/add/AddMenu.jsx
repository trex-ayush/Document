import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import { useIsMobile } from '@/hooks/useIsMobile.js';
import { useClickOutside } from '@/hooks/useClickOutside.js';
import { Plus } from 'lucide-react';
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
  const Icon = option.icon;
  return (
    <button
      type="button"
      role={role}
      onClick={() => onSelect(option.key)}
      className={`w-full flex items-center gap-3 text-left transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none dark:hover:bg-neutral-700/60 dark:focus-visible:bg-neutral-700/60 ${
        compact ? 'px-3 py-2.5 rounded-lg' : 'px-5 py-3'
      }`}
    >
      <span className="w-9 h-9 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
        <Icon className="w-[18px] h-[18px] text-primary-600 dark:text-primary-400" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{t(option.labelKey, option.label)}</span>
        <span className="block text-xs text-neutral-500 dark:text-neutral-400">{t(option.hintKey, option.hint)}</span>
      </span>
    </button>
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
    <Drawer isOpen={isOpen} onClose={onClose} side="right" size="sm" title={t('addMenu.title', 'What do you want to add?')}>
      <div className="-mx-5 -my-4 py-2">
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

export default AddButton;
