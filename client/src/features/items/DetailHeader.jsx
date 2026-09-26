import { useTranslation } from 'react-i18next';
import { EllipsisVertical } from 'lucide-react';
import { Dropdown } from '@/components/ui/Dropdown.jsx';
import { ICON_BUTTON_CLASS } from '@/components/ui/Button.jsx';
import Tooltip from '@/components/ui/Tooltip.jsx';

/**
 * Compact header for a password, note or document page:
 *
 *   Papa › Bank                                   (small breadcrumb)
 *   SBI net banking                    [✎] [⋮]   (title; actions on the right of the same row)
 *   [🔑 Password]                                  (small muted type chip)
 *
 * `actions` are small buttons (an icon on phones, icon + label on PC); `menu` holds the
 * `DropdownItem`s behind ⋮ (Move, Delete…). No big button row.
 *
 * Props: breadcrumb?, title, chip? ({ icon, label }), actions?, menu?, menuLabel (the ⋮ button's
 * name, translated by the page)
 */
export default function DetailHeader({ breadcrumb, title, chip, actions, menu, menuLabel }) {
  const { t } = useTranslation('common');
  const ChipIcon = chip?.icon;
  const label = menuLabel;
  return (
    <div className="mb-3 sm:mb-4">
      {breadcrumb && <div className="mb-0.5 text-sm text-neutral-500 dark:text-neutral-400">{breadcrumb}</div>}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-1.5">
          <h1 className="break-words text-xl font-bold leading-tight text-neutral-900 sm:text-2xl dark:text-neutral-100">{title}</h1>
          {chip && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {ChipIcon && <ChipIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {chip.label}
            </span>
          )}
        </div>
        {(actions || menu) && (
          <div className="flex flex-shrink-0 items-center gap-1">
            {actions}
            {menu && (
              <Dropdown
                align="right"
                trigger={
                  <Tooltip content={t('tip.moreOptions', 'More options')}>
                    <span className={ICON_BUTTON_CLASS} aria-label={label}>
                      <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </Tooltip>
                }
              >
                {menu}
              </Dropdown>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
