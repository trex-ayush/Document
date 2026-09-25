import { useFieldArray } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import Input from '@/components/ui/Input.jsx';
import Button from '@/components/ui/Button.jsx';
import Switch from '@/components/ui/Switch.jsx';
import { Plus, X } from 'lucide-react';

/**
 * Dynamic key/value/sensitive rows for a login or record item's `fields[]` (docs/ITEMS.md — same
 * shape as a Document's `customFields`). Used by ItemForm for `kind: 'login'|'record'`; the
 * `'note'` kind uses a single big textarea instead (see ItemForm).
 */
export default function FieldRows({ control, register, name = 'fields', errors }) {
  const { t } = useTranslation('items');
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <div key={field.id} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-2.5 sm:border-0 sm:p-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2">
            <div className="flex-1">
              <Input placeholder={t('fieldRows.keyPlaceholder', 'Label (e.g. username)')} error={errors?.[index]?.key?.message} {...register(`${name}.${index}.key`)} />
            </div>
            <div className="flex-1">
              <Input placeholder={t('fieldRows.valuePlaceholder', 'Value')} type="text" {...register(`${name}.${index}.value`)} />
            </div>
            <div className="flex items-center justify-between sm:justify-start sm:flex-shrink-0 sm:pt-2 gap-2">
              <Switch size="sm" label={t('fieldRows.secretLabel', 'Secret')} {...register(`${name}.${index}.sensitive`)} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="flex-shrink-0 min-w-[44px] min-h-[44px]"
                onClick={() => remove(index)}
                aria-label={t('fieldRows.removeField', 'Remove field')}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leftIcon={<Plus className="w-4 h-4" />}
        onClick={() => append({ key: '', value: '', type: 'text', sensitive: false })}
      >
        {t('fieldRows.addField', 'Add field')}
      </Button>
    </div>
  );
}
