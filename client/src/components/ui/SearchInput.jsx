import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';

/**
 * SearchInput — `<input type="search">` with a magnifying-glass icon and an
 * optional clear (x) button. Forwards `ref` (Rule 14).
 *
 * Ported from apps/template/src/components/ui/SearchInput.jsx. Added a
 * `primary` ring color preset (our coral brand token) as the default instead
 * of `blue`.
 *
 * Props:
 *  - value, onChange, placeholder: standard controlled-input props
 *  - onClear?:   callback for the x button; defaults to calling
 *                `onChange({ target: { value: '' } })`
 *  - size?:      'sm' (default) | 'md'
 *  - ringColor?: 'primary' (default) | 'neutral'
 *  - className?, wrapperClassName?: appended to the `<input>` / outer `<div>`
 *  - ...rest:    forwarded to the `<input>`
 *
 * @example
 * <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents..." />
 */
const SIZE = {
  sm: { input: 'pl-8 pr-8 py-1.5 text-xs', icon: 'left-2.5 w-3.5 h-3.5', clear: 'right-2 w-3.5 h-3.5' },
  md: { input: 'pl-9 pr-9 py-2 text-sm', icon: 'left-3 w-4 h-4', clear: 'right-2.5 w-4 h-4' },
};

const RING = {
  primary: 'focus:ring-primary-400',
  neutral: 'focus:ring-neutral-400',
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
    ringColor = 'primary',
    ...rest
  },
  ref
) {
  const { t } = useTranslation('common');
  const sz = SIZE[size] || SIZE.sm;
  const ring = RING[ringColor] || RING.primary;
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
        className={`w-full border border-neutral-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 ${ring} focus:border-transparent ${sz.input} ${className}`}
        {...rest}
      />
      {showClear && (
        <button
          type="button"
          onClick={handleClear}
          aria-label={t('search.clear', 'Clear search')}
          className={`absolute top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 ${sz.clear}`}
        >
          <X className="w-full h-full" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
});

export default SearchInput;
