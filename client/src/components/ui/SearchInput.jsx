import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { FIELD_BORDER, FIELD_CONTROL } from './tokens.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

/**
 * SearchInput — `<input type="search">` with a magnifying-glass icon and an
 * optional clear (x) button. Forwards `ref` (Rule 14).
 *
 * Ported from apps/template/src/components/ui/SearchInput.jsx. `size="md"` is the standard
 * field box (same as Input); the old `ringColor` prop is accepted and ignored.
 *
 * Props:
 *  - value, onChange, placeholder: standard controlled-input props
 *  - onClear?:   callback for the x button; defaults to calling
 *                `onChange({ target: { value: '' } })`
 *  - size?:      'md' (the standard field box, like Input) | 'sm' (dense toolbars; default)
 *  - className?, wrapperClassName?: appended to the `<input>` / outer `<div>`
 *  - ...rest:    forwarded to the `<input>`
 *
 * @example
 * <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents..." />
 */
const SIZE = {
  sm: { input: 'w-full rounded-lg border bg-white py-1.5 pl-8 pr-8 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-3 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500', icon: 'left-2.5 w-3.5 h-3.5', clearPos: 'right-1', clear: 'h-8 w-8', clearIcon: 'h-3.5 w-3.5' },
  md: { input: `${FIELD_CONTROL} pl-9 pr-11`, icon: 'left-3 w-4 h-4', clearPos: 'right-0 h-full', clear: 'h-full w-11', clearIcon: 'h-4 w-4' },
};

const SearchInput = forwardRef(function SearchInput(
  {
    value,
    onChange,
    onClear,
    placeholder,
    size = 'sm',
    className = '',
    wrapperClassName = '',
    // eslint-disable-next-line no-unused-vars
    ringColor,
    ...rest
  },
  ref
) {
  const { t } = useTranslation('common');
  const sz = SIZE[size] || SIZE.sm;
  const resolvedPlaceholder = placeholder ?? t('search.placeholder', 'Search...');

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange) {
      onChange({ target: { value: '' } });
    }
  };

  const showClear = value && (onClear || onChange);

  return (
    <div className={`relative ${wrapperClassName}`}>
      <Search
        className={`absolute top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500 pointer-events-none ${sz.icon}`}
        strokeWidth={2}
        aria-hidden="true"
      />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={onChange}
        placeholder={resolvedPlaceholder}
        className={`${sz.input} ${FIELD_BORDER} ${className}`}
        {...rest}
      />
      {showClear && (
        <Tooltip content={t('tip.clear', 'Clear what you typed')} className={`absolute top-1/2 flex -translate-y-1/2 ${sz.clearPos || ''}`}>
          <button
            type="button"
            onClick={handleClear}
            aria-label={t('search.clear', 'Clear search')}
            className={`flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 ${sz.clear}`}
          >
            <X className={sz.clearIcon} strokeWidth={2} aria-hidden="true" />
          </button>
        </Tooltip>
      )}
    </div>
  );
});

export default SearchInput;
