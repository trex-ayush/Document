import { useTranslation } from 'react-i18next';
import Input from '@/components/ui/Input.jsx';
import Button from '@/components/ui/Button.jsx';
import { Plus, X } from 'lucide-react';

let rowSeq = 0;
/** A new, empty extra-field row. `uid` is only a React key — it is never sent to the server. */
export const newFieldRow = (key = '', value = '') => ({ uid: `f${rowSeq++}`, key, value });

/**
 * "+ Add field" rows for a password: each row is a name (e.g. "PIN", "Website") and its value,
 * removable. Controlled: `rows` is `[{ uid, key, value }]`, `onChange(nextRows)`.
 * `errors` maps a row uid to a message (a value without a name).
 */
export default function FieldRows({ rows, onChange, errors = {}, disabled = false }) {
  const { t } = useTranslation('items');
  const update = (uid, patch) => onChange(rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.uid} className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              aria-label={t('fieldRows.keyLabel', 'Field name')}
              placeholder={t('fieldRows.keyPlaceholder', 'Name (e.g. PIN)')}
              value={row.key}
              maxLength={100}
              disabled={disabled}
              error={errors[row.uid]}
              onChange={(e) => update(row.uid, { key: e.target.value })}
            />
            <Input
              aria-label={t('fieldRows.valueLabel', 'Value')}
              placeholder={t('fieldRows.valuePlaceholder', 'Value')}
              value={row.value}
              maxLength={2000}
              disabled={disabled}
              autoComplete="off"
              onChange={(e) => update(row.uid, { value: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((r) => r.uid !== row.uid))}
            disabled={disabled}
            aria-label={t('fieldRows.removeField', 'Remove field')}
            title={t('fieldRows.removeField', 'Remove field')}
            className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-900/20"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leftIcon={<Plus className="h-4 w-4" />}
        onClick={() => onChange([...rows, newFieldRow()])}
        disabled={disabled}
      >
        {t('fieldRows.addField', 'Add field')}
      </Button>
    </div>
  );
}
