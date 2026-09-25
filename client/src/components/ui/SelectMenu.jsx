import { Check, ChevronDown } from 'lucide-react';
import { Dropdown, DropdownItem } from './Dropdown.jsx';
import { FIELD_BORDER, FIELD_CONTROL, FIELD_LABEL } from './tokens.js';

/**
 * SelectMenu — the app's own dropdown for picking one of many options (Activity filters, a
 * unit or file format), used instead of the browser's native `<select>`. The closed control is
 * the standard field box; the open list is the standard `Dropdown` panel, with a tick on the
 * chosen option. For 2–6 options prefer `ChoiceGroup` (tappable cards).
 *
 * Props: options [{ value, label }], value, onChange(value), label?, placeholder?,
 * id? (for the label), 'aria-label'?, className? (on the wrapper)
 *
 * @example
 * <SelectMenu aria-label="Member" value={memberId} onChange={setMemberId}
 *   options={[{ value: '', label: 'All members' }, ...members.map((m) => ({ value: m.id, label: m.name }))]} />
 */
export default function SelectMenu({ options, value, onChange, label, placeholder = '', id, className = '', ...rest }) {
  const selected = options.find((o) => o.value === value);
  const ariaLabel = rest['aria-label'] || label;
  return (
    <div className={`min-w-0 ${className}`}>
      {label && (
        <span id={id ? `${id}-label` : undefined} className={FIELD_LABEL}>
          {label}
        </span>
      )}
      <Dropdown
        wrapperClassName="block w-full"
        triggerClassName="flex w-full"
        className="max-h-72 w-full overflow-y-auto"
        trigger={
          <span
            id={id}
            aria-label={ariaLabel ? `${ariaLabel}: ${selected?.label ?? placeholder}` : undefined}
            className={`flex items-center justify-between gap-2 text-left ${FIELD_CONTROL} ${FIELD_BORDER}`}
          >
            <span className={`min-w-0 truncate ${selected ? '' : 'text-neutral-400 dark:text-neutral-500'}`}>
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-neutral-400" aria-hidden="true" />
          </span>
        }
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <DropdownItem key={String(opt.value)} onSelect={() => onChange(opt.value)}>
              <span className={`flex w-full items-center justify-between gap-3 ${active ? 'font-medium text-neutral-900 dark:text-neutral-100' : ''}`}>
                <span className="min-w-0">{opt.label}</span>
                {active && <Check className="h-4 w-4 flex-shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />}
              </span>
            </DropdownItem>
          );
        })}
      </Dropdown>
    </div>
  );
}
