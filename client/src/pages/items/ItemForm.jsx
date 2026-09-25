import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import { Textarea } from '@/components/ui/Textarea.jsx';
import { FormField } from '@/components/ui/FormField.jsx';

import foldersApi from '@/services/foldersApi.js';
import membersApi from '@/services/membersApi.js';
import itemsApi from '@/services/itemsApi.js';
import FieldRows from '@/features/items/FieldRows.jsx';

/** Flattens `GET /folders/tree`'s parentId-linked list into a depth-ordered, indentable array. */
function flattenFolders(items) {
  const byParent = new Map();
  for (const f of items) {
    const key = f.parentId || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(f);
  }
  const out = [];
  const walk = (parentKey, depth) => {
    const children = [...(byParent.get(parentKey) || [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      out.push({ id: child.id, name: child.name, depth });
      walk(child.id, depth + 1);
    }
  };
  walk('root', 0);
  return out;
}

/**
 * Shared create/edit form for a vault item. `kind` drives the field editor: `'note'` shows one big
 * textarea (mapped to a single `fields: [{key:'note', sensitive:true}]` entry on submit);
 * `'login'`/`'record'` show the generic key/value/sensitive row editor (FieldRows) — see
 * docs/ITEMS.md "Data model".
 *
 * In edit mode, `initialItem` must already have any sensitive field's real plaintext in `value`
 * (ItemEdit.jsx reveals every sensitive field, via reauth if needed, before ever rendering this
 * form) — `PATCH /items/:id` replaces the whole `fields` array, so submitting a masked/blank
 * sensitive value here would silently erase the saved secret.
 */
export default function ItemForm({ mode, initialItem, defaultKind = 'login' }) {
  const { t } = useTranslation(['items', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const KIND_LABEL = {
    login: t('kinds.login', 'Password / login'),
    record: t('kinds.record', 'Number / record'),
    note: t('kinds.note', 'Secure note'),
  };
  const KIND_DEFAULT_FIELDS = {
    login: [
      { key: t('form.defaultFields.username', 'username'), value: '', type: 'text', sensitive: false },
      { key: t('form.defaultFields.password', 'password'), value: '', type: 'text', sensitive: true },
      { key: t('form.defaultFields.website', 'website'), value: '', type: 'url', sensitive: false },
    ],
    record: [{ key: '', value: '', type: 'text', sensitive: false }],
    note: [],
  };

  const fieldSchema = z.object({
    key: z.string().trim().min(1, t('form.validation.fieldKeyRequired', 'Required')),
    value: z.string().optional().default(''),
    type: z.string().optional().default('text'),
    sensitive: z.boolean().optional().default(false),
  });

  const itemSchema = z.object({
    title: z.string().trim().min(1, t('form.validation.titleRequired', 'Title is required')).max(200),
    folderId: z.string().min(1, t('form.validation.folderRequired', 'Choose a folder')),
    kind: z.enum(['login', 'record', 'note']),
    memberId: z.string().optional().default(''),
    tagsInput: z.string().optional().default(''),
    fields: z.array(fieldSchema).optional().default([]),
    note: z.string().optional().default(''),
  });

  const { data: foldersData } = useQuery({ queryKey: ['folders', 'tree'], queryFn: foldersApi.tree });
  const { data: membersData } = useQuery({ queryKey: ['members'], queryFn: membersApi.list });
  const folderOptions = useMemo(() => flattenFolders(foldersData?.items || []), [foldersData]);
  const members = membersData?.items || [];

  const kind = initialItem?.kind || defaultKind;
  const existingNoteField = initialItem?.fields?.find((f) => f.key === 'note');

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      title: initialItem?.title || '',
      folderId: initialItem?.folderId || '',
      kind,
      memberId: initialItem?.memberId || '',
      tagsInput: (initialItem?.tags || []).join(', '),
      fields: initialItem
        ? initialItem.fields.filter((f) => f.key !== 'note' || kind !== 'note').map((f) => ({ key: f.key, value: f.value || '', type: f.type, sensitive: f.sensitive }))
        : KIND_DEFAULT_FIELDS[kind],
      note: existingNoteField?.value || '',
    },
  });

  const watchedKind = watch('kind');

  // A native <select> (registered uncontrolled, not React-controlled) can only show a value once
  // a matching <option> exists in the DOM — RHF applies `defaultValues.folderId`/`memberId` once,
  // on mount, which is often before `foldersApi.tree()`/`membersApi.list()` have resolved, so the
  // select silently falls back to "unselected". Re-apply the value once the matching option is
  // actually present, so an edit doesn't appear to reset the item's folder/member.
  useEffect(() => {
    if (initialItem?.folderId && folderOptions.some((f) => f.id === initialItem.folderId)) {
      setValue('folderId', initialItem.folderId);
    }
  }, [folderOptions, initialItem?.folderId, setValue]);

  useEffect(() => {
    if (initialItem?.memberId && members.some((m) => m.id === initialItem.memberId)) {
      setValue('memberId', initialItem.memberId);
    }
  }, [members, initialItem?.memberId, setValue]);

  const createMutation = useMutation({ mutationFn: itemsApi.create });
  const updateMutation = useMutation({ mutationFn: (payload) => itemsApi.update(initialItem.id, payload) });

  const onSubmit = async (values) => {
    const tags = values.tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const fields =
      values.kind === 'note'
        ? [{ key: 'note', value: values.note, type: 'text', sensitive: true }]
        : values.fields.filter((f) => f.key.trim().length > 0);

    const payload = {
      title: values.title,
      folderId: values.folderId,
      kind: values.kind,
      memberId: values.memberId || null,
      tags,
      fields,
    };

    try {
      const saved = mode === 'create' ? await createMutation.mutateAsync(payload) : await updateMutation.mutateAsync(payload);
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success(mode === 'create' ? t('form.saveSuccess', 'Item saved') : t('form.updateSuccess', 'Item updated'));
      navigate(`/items/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('form.saveFailed', 'Could not save this item.'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 max-w-xl">
      <input type="hidden" {...register('kind')} />

      <FormField label={t('form.typeLabel', 'Type')}>
        <div className="flex flex-wrap gap-2">
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={watchedKind === value ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setValue('kind', value, { shouldDirty: true })}
            >
              {label}
            </Button>
          ))}
        </div>
      </FormField>

      <Input
        label={t('form.titleLabel', 'Title')}
        placeholder={t('form.titlePlaceholder', 'e.g. Netflix, Passport number, Wifi password')}
        error={errors.title?.message}
        {...register('title')}
      />

      <FormField label={t('form.folderLabel', 'Folder')} required error={errors.folderId?.message}>
        <select
          className="w-full min-h-[44px] px-4 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-xl text-sm text-neutral-900 dark:text-white bg-white dark:bg-neutral-700"
          {...register('folderId')}
        >
          <option value="">{t('form.folderPlaceholder', 'Select a folder')}</option>
          {folderOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {'—'.repeat(f.depth)} {f.name}
            </option>
          ))}
        </select>
      </FormField>

      {members.length > 0 && (
        <FormField label={t('form.memberLabel', 'Family member (optional)')}>
          <select
            className="w-full min-h-[44px] px-4 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-xl text-sm text-neutral-900 dark:text-white bg-white dark:bg-neutral-700"
            {...register('memberId')}
          >
            <option value="">{t('common:people.shared', 'Shared (whole family)')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <Input label={t('form.tagsLabel', 'Tags (comma separated)')} placeholder={t('form.tagsPlaceholder', 'streaming, shared')} {...register('tagsInput')} />

      {watchedKind === 'note' ? (
        <Textarea label={t('form.noteLabel', 'Secure note')} rows={8} placeholder={t('form.notePlaceholder', 'Write your note here…')} {...register('note')} />
      ) : (
        <FormField label={t('form.fieldsLabel', 'Fields')}>
          <FieldRows control={control} register={register} errors={errors.fields} />
        </FormField>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
          {t('common:actions.cancel', 'Cancel')}
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {mode === 'create' ? t('form.saveItem', 'Save item') : t('form.saveChanges', 'Save changes')}
        </Button>
      </div>
    </form>
  );
}
