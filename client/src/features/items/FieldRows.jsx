import { useFieldArray } from 'react-hook-form';
import Input from '@/components/ui/Input.jsx';
import Button from '@/components/ui/Button.jsx';
import Switch from '@/components/ui/Switch.jsx';
import { PlusIcon, CloseIcon } from '@/components/layout/icons.jsx';

/**
 * Dynamic key/value/sensitive rows for a login or record item's `fields[]` (docs/ITEMS.md — same
 * shape as a Document's `customFields`). Used by ItemForm for `kind: 'login'|'record'`; the
 * `'note'` kind uses a single big textarea instead (see ItemForm).
 */
export default function FieldRows({ control, register, name = 'fields', errors }) {
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-start gap-2">
          <div className="flex-1">
            <Input placeholder="Label (e.g. username)" error={errors?.[index]?.key?.message} {...register(`${name}.${index}.key`)} />
          </div>
          <div className="flex-1">
            <Input placeholder="Value" type="text" {...register(`${name}.${index}.value`)} />
          </div>
          <div className="flex-shrink-0 pt-2">
            <Switch size="sm" label="Secret" {...register(`${name}.${index}.sensitive`)} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="flex-shrink-0"
            onClick={() => remove(index)}
            aria-label="Remove field"
          >
            <CloseIcon className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leftIcon={<PlusIcon className="w-4 h-4" />}
        onClick={() => append({ key: '', value: '', type: 'text', sensitive: false })}
      >
        Add field
      </Button>
    </div>
  );
}
