import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Textarea from '@/components/ui/Textarea.jsx';
import { Card, CardBody } from '@/components/ui/Card.jsx';
import { FIELD_GAP, FIELD_LABEL } from '@/components/ui/tokens.js';
import FieldRows, { newFieldRow } from './FieldRows.jsx';
import { useCreateItem, useUpdateItem } from './itemsHooks.js';
import { Eye, EyeOff } from 'lucide-react';

const TITLE_MAX = 200;
const NOTES_MAX = 10000;

/**
 * The one form behind "Save password", "Write note" and editing either.
 *  - `kind: 'login'` — Title, Username / email, Password (hidden, with Show), extra fields, Notes.
 *  - `kind: 'note'`  — Title and a big Notes box.
 * `mode: 'edit'` takes `initialItem` (from GET /items/:id, password included) and PATCHes it.
 * Saving goes to `/items/:id`. No `folderId` on create = the server saves it in Shared.
 */
export default function ItemForm({ kind, mode = 'create', initialItem, folderId, onCancel }) {
  const { t } = useTranslation(['items', 'common']);
  const navigate = useNavigate();
  const isLogin = kind === 'login';
  const createItem = useCreateItem();
  const updateItem = useUpdateItem(initialItem?.id);

  const [form, setForm] = useState(() => ({
    title: initialItem?.title || '',
    username: initialItem?.username || '',
    password: initialItem?.password || '',
    notes: initialItem?.notes || '',
    fields: (initialItem?.fields || []).map((f) => newFieldRow(f.key || '', f.value || '')),
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ title: null, fields: {} });
  const saving = createItem.isPending || updateItem.isPending;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const fieldErrors = {};
    form.fields.forEach((r) => {
      if (!r.key.trim() && r.value.trim()) fieldErrors[r.uid] = t('form.fieldNameRequired', 'Give this field a name');
    });
    const next = { title: form.title.trim() ? null : t('form.titleRequired', 'Please give it a title'), fields: fieldErrors };
    setErrors(next);
    if (next.title || Object.keys(fieldErrors).length) return;

    const payload = { title: form.title.trim(), notes: form.notes.trim() };
    if (isLogin) {
      payload.username = form.username.trim();
      payload.password = form.password;
      payload.fields = form.fields
        .filter((r) => r.key.trim())
        .map((r) => ({ key: r.key.trim(), value: r.value.trim() }));
    }

    try {
      let saved;
      if (mode === 'edit') {
        saved = await updateItem.mutateAsync(payload);
      } else {
        saved = await createItem.mutateAsync({ kind, ...payload, ...(folderId ? { folderId } : {}) });
      }
      toast.success(
        isLogin ? t('form.passwordSaved', 'Password saved') : t('form.noteSaved', 'Note saved'),
      );
      navigate(`/items/${saved?.id || initialItem?.id}`, { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('form.saveFailed', 'Could not save. Please try again.'));
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <CardBody className={FIELD_GAP}>
          <Input
            label={<>{t('form.titleLabel', 'Title')} <span className="text-red-500">*</span></>}
            required
            maxLength={TITLE_MAX}
            value={form.title}
            error={errors.title}
            disabled={saving}
            placeholder={isLogin ? t('form.loginTitlePlaceholder', 'e.g. Gmail, SBI net banking, Wi-Fi') : t('form.noteTitlePlaceholder', 'e.g. Locker details')}
            onChange={(e) => {
              setErrors((x) => ({ ...x, title: null }));
              set('title')(e);
            }}
          />

          {isLogin && (
            <>
              <Input
                label={t('form.usernameLabel', 'Username / email')}
                value={form.username}
                maxLength={500}
                disabled={saving}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={set('username')}
              />
              <div>
                <label htmlFor="item-password" className={FIELD_LABEL}>
                  {t('form.passwordLabel', 'Password')}
                </label>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      id="item-password"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      maxLength={1000}
                      disabled={saving}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      spellCheck={false}
                      onChange={set('password')}
                      className="font-mono"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-shrink-0"
                    leftIcon={showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? t('form.hide', 'Hide') : t('form.show', 'Show')}
                  </Button>
                </div>
              </div>

              <div>
                <p className={FIELD_LABEL}>{t('form.extraFieldsLabel', 'More details')}</p>
                <FieldRows rows={form.fields} onChange={(fields) => setForm((f) => ({ ...f, fields }))} errors={errors.fields} disabled={saving} />
              </div>
            </>
          )}

          <Textarea
            label={t('form.notesLabel', 'Notes')}
            rows={isLogin ? 4 : 12}
            maxLength={NOTES_MAX}
            value={form.notes}
            disabled={saving}
            placeholder={isLogin ? '' : t('form.notePlaceholder', 'Write your note here…')}
            onChange={set('notes')}
          />

          <div className="kb-sticky flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
              {t('common:actions.cancel', 'Cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {t('common:actions.save', 'Save')}
            </Button>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}
