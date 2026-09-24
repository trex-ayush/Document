import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Switch from '@/components/ui/Switch.jsx';

const FIELD_TYPES = ['text', 'number', 'date', 'email', 'phone', 'url'];
const FIELD_TYPE_FALLBACKS = { text: 'Text', number: 'Number', date: 'Date', email: 'Email', phone: 'Phone', url: 'URL' };

/**
 * Plain, local (not-yet-persisted) custom-fields list editor for the create
 * form (`UploadModal`) — every value here is plaintext the user just typed,
 * so there's none of `CustomFieldsEditor`'s reveal/reauth machinery (that
 * only matters once a sensitive value is actually encrypted server-side).
 * `fields`: `[{ key, type, sensitive, value }]`, uncontrolled ids (order =
 * array index, matches `POST /documents`'s `customFields` shape exactly).
 */
export default function LocalCustomFieldsEditor({ fields, onChange }) {
  const { t } = useTranslation('documents');
  const update = (index, patch) => {
    const next = fields.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };
  const remove = (index) => onChange(fields.filter((_, i) => i !== index));
  const add = () => onChange([...fields, { key: '', type: 'text', sensitive: false, value: '' }]);

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
          <Input value={f.key} onChange={(e) => update(i, { key: e.target.value })} placeholder={t('localCustomFields.fieldNamePlaceholder', 'Field name')} className="min-w-[120px] flex-1" />
          <select value={f.type} onChange={(e) => update(i, { type: e.target.value })} className="h-11 rounded-lg border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
            {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t(`fieldTypes.${ft}`, FIELD_TYPE_FALLBACKS[ft])}</option>)}
          </select>
          <Input value={f.value} onChange={(e) => update(i, { value: e.target.value })} placeholder={t('localCustomFields.valuePlaceholder', 'Value')} className="min-w-[120px] flex-1" />
          <Switch size="sm" label={t('localCustomFields.sensitiveLabel', 'Sensitive')} checked={f.sensitive} onChange={(e) => update(i, { sensitive: e.target.checked })} />
          <button type="button" onClick={() => remove(i)} aria-label={t('localCustomFields.removeField', 'Remove field')} className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={add}>{t('localCustomFields.addField', '+ Add field')}</Button>
    </div>
  );
}
