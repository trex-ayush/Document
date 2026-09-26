import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';

/**
 * The folder filter in the "Folders" header: a round search button the size of the grid/list
 * buttons that opens into a soft filled search pill in place — growing to the left inside the
 * header's right-hand cluster on PC (up to 280px), taking the row on phones (the parent hides its
 * title there while it's open). The input stays mounted the whole time — only its width and opacity change — so the
 * phone keyboard never closes while typing, and opening focuses it within the tap (iOS needs
 * that to show the keyboard). Esc or ✕ closes and clears; leaving it empty closes it too.
 *
 * Props: value, onChange(text), open, onOpenChange(bool), placeholder? (default "Search folders…"),
 * className
 */
export default function FolderSearch({ value, onChange, open, onOpenChange, placeholder, className = '' }) {
  const { t } = useTranslation('dashboard');
  const inputRef = useRef(null);
  const openButtonRef = useRef(null);
  const label = t('folders.search', 'Search folders');

  const openSearch = () => {
    onOpenChange(true);
    inputRef.current?.focus();
  };
  // Closing hands focus back (so a phone keyboard closes too); from the keyboard it lands on
  // the search button again.
  const close = ({ refocus = false } = {}) => {
    onChange('');
    onOpenChange(false);
    inputRef.current?.blur();
    if (refocus) requestAnimationFrame(() => openButtonRef.current?.focus());
  };

  return (
    <div
      // No ring or border: focus just darkens the pill a little.
      className={`relative flex h-11 flex-shrink-0 items-center rounded-xl bg-neutral-100 transition-[width,background-color] duration-200 ease-out focus-within:bg-neutral-200/70 dark:bg-neutral-800 dark:focus-within:bg-neutral-700/80 ${
        open ? 'w-full min-w-0 max-sm:flex-1 sm:w-[280px]' : 'w-11'
      } ${className}`}
    >
      {open && <Search className="pointer-events-none absolute left-3 h-5 w-5 text-neutral-400" aria-hidden="true" />}
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close({ refocus: true });
          }
        }}
        onBlur={() => {
          if (!value.trim()) onOpenChange(false);
        }}
        placeholder={placeholder || t('folders.searchPlaceholder', 'Search folders…')}
        aria-label={label}
        tabIndex={open ? 0 : -1}
        aria-hidden={open ? undefined : true}
        className={`h-full w-full min-w-0 rounded-xl border-0 bg-transparent pl-10 pr-11 text-sm text-neutral-900 placeholder-neutral-400 transition-opacity duration-200 focus:outline-none focus:ring-0 dark:text-neutral-100 dark:placeholder-neutral-500 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {open ? (
        <button
          type="button"
          // Keep focus in the box: without this, tapping ✕ blurs the input first.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => close()}
          aria-label={t('folders.closeSearch', 'Close search')}
          title={t('folders.closeSearch', 'Close search')}
          className="absolute right-0.5 flex h-10 w-10 items-center justify-center rounded-[10px] text-neutral-500 hover:bg-white hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          ref={openButtonRef}
          type="button"
          onClick={openSearch}
          aria-label={label}
          title={label}
          aria-expanded={false}
          className="absolute inset-0.5 flex items-center justify-center rounded-[10px] text-neutral-500 hover:bg-white hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
