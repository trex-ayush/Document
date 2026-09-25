import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Switch from '@/components/ui/Switch.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import CopyButton from './CopyButton.jsx';
import { useReauth } from './useReauth.jsx';
import { useUpdateDocument } from './documentsHooks.js';
import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';

const FIELD_TYPES = ['text', 'number', 'date', 'email', 'phone', 'url'];
const FIELD_TYPE_FALLBACKS = { text: 'Text', number: 'Number', date: 'Date', email: 'Email', phone: 'Phone', url: 'URL' };

function blankField() {
  return {
    _localId: `new-${Math.random().toString(36).slice(2)}`,
    id: null,
    key: '',
    type: 'text',
    sensitive: false,
    value: '',
    masked: '',
    hasValue: false,
    _dirty: true,
    _revealed: false,
  };
}

/**
 * Add/rename/edit/reorder/delete a document's custom fields. Every field
 * gets a copy button (`CopyButton` — even sensitive ones, since the main use
 * case is filling other forms); sensitive fields show the server-computed
 * mask (`field.masked`, e.g. "•••• 1234" — `documents/serializer.js`'s
 * `maskValue`) with a reveal toggle instead of the raw value.
 *
 * **Why saving can trigger reveal calls**: `PATCH /documents/:id`'s
 * `customFields` REPLACES the whole array (docs/API.md) and the server
 * re-encrypts whatever plaintext is sent (server/src/modules/documents/
 * routes.js `buildCustomFieldSubdocs` — confirmed while reading it: there is
 * no "keep existing ciphertext" sentinel). So any sensitive field the user
 * didn't explicitly retype must be revealed first so its real value can be
 * resent unchanged — otherwise saving would silently overwrite it with
 * whatever placeholder we'd otherwise send. This editor reveals only the
 * sensitive fields that are actually dirty-by-necessity (add/remove/reorder/
 * rename any field, or edit any value) right before submitting, batching
 * them behind a single reauth prompt via `useReauth`'s token cache. See this
 * agent's final report ("reauth-prompt mechanism" judgment call).
 */
export default function CustomFieldsEditor({ documentId, fields: serverFields, editable = true }) {
  const { t } = useTranslation('documents');
  const [fields, setFields] = useState(() => (serverFields || []).map((f) => ({ ...f, _localId: f.id, _dirty: false, _revealed: false })));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { revealField, ReauthDialog } = useReauth();
  const update = useUpdateDocument(documentId);

  useEffect(() => {
    setFields((serverFields || []).map((f) => ({ ...f, _localId: f.id, _dirty: false, _revealed: false })));
    setDirty(false);
  }, [serverFields]);

  const markDirty = () => setDirty(true);

  const updateField = (localId, patch) => {
    setFields((prev) => prev.map((f) => (f._localId === localId ? { ...f, ...patch } : f)));
    markDirty();
  };

  const addField = () => {
    setFields((prev) => [...prev, blankField()]);
    markDirty();
  };

  const removeField = (localId) => {
    setFields((prev) => prev.filter((f) => f._localId !== localId));
    markDirty();
  };

  const move = (index, dir) => {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    markDirty();
  };

  const handleReveal = async (localId) => {
    const field = fields.find((f) => f._localId === localId);
    if (!field?.id) return;
    try {
      const value = await revealField(documentId, field.id);
      updateField(localId, { value, _revealed: true });
    } catch (err) {
      if (err?.message !== 'Reauth cancelled') {
        toast.error(err?.response?.data?.message || t('customFields.toasts.revealFailed', 'Could not reveal this value'));
      }
    }
  };

  const handleCopySensitive = async (field) => {
    if (field._revealed || field._dirty) return field.value;
    if (!field.id) return '';
    return revealField(documentId, field.id);
  };

  const handleSave = async () => {
    const withEmptyKey = fields.some((f) => !f.key.trim());
    if (withEmptyKey) {
      toast.error(t('customFields.everyFieldNeedsName', 'Every field needs a name'));
      return;
    }
    setSaving(true);
    try {
      // Resolve real plaintext for any sensitive field we haven't touched
      // this session (see file doc-comment above).
      const resolved = await Promise.all(
        fields.map(async (f) => {
          if (!f.sensitive || f._dirty || f._revealed || !f.id) return f;
          const value = await revealField(documentId, f.id);
          return { ...f, value };
        }),
      );
      const payload = resolved.map((f) => ({
        key: f.key.trim(),
        type: f.type,
        sensitive: f.sensitive,
        value: f.value ?? '',
      }));
      await update.mutateAsync({ customFields: payload });
      toast.success(t('customFields.toasts.saved', 'Fields saved'));
      setDirty(false);
    } catch (err) {
      if (err?.message !== 'Reauth cancelled') {
        toast.error(err?.response?.data?.message || t('customFields.toasts.saveFailed', 'Could not save fields'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {fields.length === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('customFields.noFieldsYet', 'No custom fields yet — tap "+ Add field" below to create one.')}</p>
      )}

      {fields.map((field, index) => (
        <div key={field._localId} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
          <div className="flex items-start gap-2">
            <div className="flex flex-shrink-0 flex-col">
              <button
                type="button"
                aria-label={t('customFields.moveUp', 'Move up')}
                disabled={index === 0 || !editable}
                onClick={() => move(index, -1)}
                className="flex h-11 w-11 items-center justify-center text-neutral-400 disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t('customFields.moveDown', 'Move down')}
                disabled={index === fields.length - 1 || !editable}
                onClick={() => move(index, 1)}
                className="flex h-11 w-11 items-center justify-center text-neutral-400 disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={field.key}
                  disabled={!editable}
                  onChange={(e) => updateField(field._localId, { key: e.target.value })}
                  placeholder={t('customFields.fieldNamePlaceholder', 'Field name (e.g. Policy number)')}
                  className="min-w-[160px] flex-1"
                />
                <select
                  value={field.type}
                  disabled={!editable}
                  onChange={(e) => updateField(field._localId, { type: e.target.value })}
                  className="h-11 rounded-lg border border-neutral-200 bg-white px-2 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  {FIELD_TYPES.map((ft) => (
                    <option key={ft} value={ft}>{t(`fieldTypes.${ft}`, FIELD_TYPE_FALLBACKS[ft])}</option>
                  ))}
                </select>
              </div>

              <FieldValueRow
                field={field}
                editable={editable}
                onChangeValue={(value) => updateField(field._localId, { value, _dirty: true })}
                onReveal={() => handleReveal(field._localId)}
                onCopy={() => handleCopySensitive(field)}
              />

              <Switch
                size="sm"
                label={t('customFields.sensitiveLabel', 'Sensitive')}
                checked={field.sensitive}
                disabled={!editable}
                onChange={(e) => updateField(field._localId, { sensitive: e.target.checked, _dirty: true })}
              />
            </div>

            {editable && (
              <button
                type="button"
                aria-label={t('customFields.deleteField', 'Delete field')}
                onClick={() => removeField(field._localId)}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ))}

      {editable && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={addField}>{t('customFields.addField', '+ Add field')}</Button>
          {dirty && (
            <Button size="sm" loading={saving} onClick={handleSave}>{t('customFields.saveFields', 'Save fields')}</Button>
          )}
          {saving && <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('customFields.resolvingValues', 'Resolving sensitive values…')}</span>}
        </div>
      )}

      <ReauthDialog />
    </div>
  );
}

function FieldValueRow({ field, editable, onChangeValue, onReveal, onCopy }) {
  const { t } = useTranslation('documents');
  if (!field.sensitive) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={field.value}
          disabled={!editable}
          onChange={(e) => onChangeValue(e.target.value)}
          placeholder={t('customFields.valuePlaceholder', 'Value')}
          className="flex-1"
        />
        <CopyButton getValue={() => field.value} />
      </div>
    );
  }

  const showingRealValue = field._revealed || field._dirty;

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type={showingRealValue ? 'text' : 'text'}
        value={showingRealValue ? field.value : field.masked || '••••'}
        disabled={!editable || !showingRealValue}
        onChange={(e) => onChangeValue(e.target.value)}
        placeholder={field.hasValue ? undefined : t('customFields.noValueSet', 'No value set')}
        className="flex-1"
      />
      {editable && !showingRealValue && (
        <button
          type="button"
          onClick={() => onChangeValue('')}
          title={t('customFields.enterNewValue', 'Enter a new value')}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
        >
          <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {!field._dirty && field.hasValue && (
        <button
          type="button"
          onClick={onReveal}
          title={showingRealValue ? t('customFields.hideValue', 'Hide value') : t('customFields.revealValue', 'Reveal value')}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
        >
          {showingRealValue ? (
            <EyeOff className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      )}
      <CopyButton getValue={onCopy} />
    </div>
  );
}
