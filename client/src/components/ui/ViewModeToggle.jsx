/**
 * ViewModeToggle — segmented control for switching between two (or more)
 * views. In Family Vault this is Grid/List for the Browse page's document
 * view, instead of the source's Kanban/Table.
 *
 * Ported from apps/template/src/components/ui/ViewModeToggle.jsx. Changed
 * the default `options` to `grid`/`list` (this app has no Kanban view) and
 * dropped the `hidden lg:flex` wrapper class — Browse's grid/list toggle is
 * useful on mobile too, unlike PTM's desktop-only Kanban/Table toggle.
 *
 * Props: value, onChange(mode), options? ([{ value, label }], default grid/list), className?
 *
 * @example
 * <ViewModeToggle value={viewMode} onChange={setViewMode} />
 */
import { useTranslation } from 'react-i18next';

const DEFAULT_OPTIONS = [
  { value: 'grid', label: 'Grid', labelKey: 'view.grid' },
  { value: 'list', label: 'List', labelKey: 'view.list' },
];

const ViewModeToggle = ({ value, onChange, options = DEFAULT_OPTIONS, className = '' }) => {
  const { t } = useTranslation('common');
  return (
  <div className={`inline-flex items-center bg-gray-100 dark:bg-neutral-800 rounded-lg p-1 ${className}`}>
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
          value === opt.value
            ? 'bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100 shadow-sm'
            : 'text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-100'
        }`}
      >
        {opt.labelKey ? t(opt.labelKey, opt.label) : opt.label}
      </button>
    ))}
  </div>
  );
};

export default ViewModeToggle;
