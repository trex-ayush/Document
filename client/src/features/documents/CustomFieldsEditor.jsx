import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Switch from '@/components/ui/Switch.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import CopyButton from './CopyButton.jsx';
import { useReauth } from './useReauth.jsx';
import { useUpdateDocument } from './documentsHooks.js';

const FIELD_TYPES = ['text', 'number', 'date', 'email', 'phone', 'url'];

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
        toast.error(err?.response?.data?.message || 'Could not reveal this value');
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
      toast.error('Every field needs a name');
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
      toast.success('Fields saved');
      setDirty(false);
    } catch (err) {
      if (err?.message !== 'Reauth cancelled') {
        toast.error(err?.response?.data?.message || 'Could not save fields');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {fields.length === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No custom fields yet.</p>
      )}

      {fields.map((field, index) => (
        <div key={field._localId} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
          <div className="flex items-start gap-2">
            <div className="flex flex-shrink-0 flex-col">
              <button
                type="button"
                aria-label="Move up"
                disabled={index === 0 || !editable}
                onClick={() => move(index, -1)}
                className="flex h-5 w-6 items-center justify-center text-neutral-400 disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={index === fields.length - 1 || !editable}
                onClick={() => move(index, 1)}
                className="flex h-5 w-6 items-center justify-center text-neutral-400 disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
              </button>
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={field.key}
                  disabled={!editable}
                  onChange={(e) => updateField(field._localId, { key: e.target.value })}
                  placeholder="Field name (e.g. Policy number)"
                  className="min-w-[160px] flex-1"
                />
                <select
                  value={field.type}
                  disabled={!editable}
                  onChange={(e) => updateField(field._localId, { type: e.target.value })}
                  className="h-11 rounded-lg border border-neutral-200 bg-white px-2 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
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
                label="Sensitive"
                checked={field.sensitive}
                disabled={!editable}
                onChange={(e) => updateField(field._localId, { sensitive: e.target.checked, _dirty: true })}
              />
            </div>

            {editable && (
              <button
                type="button"
                aria-label="Delete field"
                onClick={() => removeField(field._localId)}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}

      {editable && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={addField}>+ Add field</Button>
          {dirty && (
            <Button size="sm" loading={saving} onClick={handleSave}>Save fields</Button>
          )}
          {saving && <span className="text-xs text-neutral-500 dark:text-neutral-400">Resolving sensitive values…</span>}
        </div>
      )}

      <ReauthDialog />
    </div>
  );
}

function FieldValueRow({ field, editable, onChangeValue, onReveal, onCopy }) {
  if (!field.sensitive) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={field.value}
          disabled={!editable}
          onChange={(e) => onChangeValue(e.target.value)}
          placeholder="Value"
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
        placeholder={field.hasValue ? undefined : 'No value set'}
        className="flex-1"
      />
      {editable && !showingRealValue && (
        <button
          type="button"
          onClick={() => onChangeValue('')}
          title="Enter a new value"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </button>
      )}
      {!field._dirty && field.hasValue && (
        <button
          type="button"
          onClick={onReveal}
          title={showingRealValue ? 'Hide value' : 'Reveal value'}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
        >
          {showingRealValue ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.774 3.162 10.066 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
        </button>
      )}
      <CopyButton getValue={onCopy} />
    </div>
  );
}
