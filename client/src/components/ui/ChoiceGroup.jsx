import { useId } from 'react';
import { Check } from 'lucide-react';
import { FIELD_HINT, FIELD_LABEL, choiceItem } from './tokens.js';

/**
 * ChoiceGroup — a few options shown as tappable choice cards (a styled radio group) instead of
 * a dropdown: "Can view only" / "Can add, edit and share", share-link durations, Active /
 * Disabled. Use it whenever there are about 2–6 options; `SelectMenu` is for longer lists.
 *
 * Props:
 *  - options: [{ value, label, hint? }]
 *  - value, onChange(value)
 *  - label? (legend), hint? (below), name? (radio group name), columns? (1 | 2 | 3, default 1)
 *  - disabled?
 *
 * @example
 * <ChoiceGroup label="Access" value={access} onChange={setAccess}
 *   options={[{ value: 'read', label: 'Can view only' }, { value: 'write', label: 'Can add, edit and share' }]} />
 */
const COLUMNS = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3' };

export default function ChoiceGroup({ options, value, onChange, label, hint, name, columns = 1, disabled = false }) {
  const autoName = useId();
  const groupName = name || autoName;
  return (
    <fieldset disabled={disabled} className="min-w-0">
      {label && <legend className={FIELD_LABEL}>{label}</legend>}
      <div className={`grid gap-2 ${COLUMNS[columns] || COLUMNS[1]}`}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <label
              key={String(opt.value)}
              className={`flex cursor-pointer items-center justify-between gap-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-400 ${choiceItem(active)} ${
                disabled ? 'cursor-not-allowed opacity-60' : ''
              }`}
            >
              <input
                type="radio"
                name={groupName}
                value={String(opt.value)}
                checked={active}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <span className="min-w-0">
                <span className="block">{opt.label}</span>
                {opt.hint && <span className="block text-xs font-normal text-neutral-500 dark:text-neutral-400">{opt.hint}</span>}
              </span>
              {active && <Check className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
            </label>
          );
        })}
      </div>
      {hint && <p className={FIELD_HINT}>{hint}</p>}
    </fieldset>
  );
}
