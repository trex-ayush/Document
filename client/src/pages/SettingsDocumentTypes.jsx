import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Table from '@/components/ui/Table.jsx';
import Badge from '@/components/ui/Badge.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import FormField from '@/components/ui/FormField.jsx';
import Modal from '@/components/ui/Modal.jsx';
import ConfirmModal from '@/components/ui/ConfirmModal.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { documentTypesApi } from '@/services/documentTypesApi.js';
import { foldersApi } from '@/services/foldersApi.js';

const FIELD_TYPES = ['text', 'number', 'date', 'email', 'phone', 'url'];
const emptyField = () => ({ key: '', type: 'text', sensitive: false });

function DocumentTypeFormModal({ isOpen, onClose, docType, folders, onSaved }) {
  const { t } = useTranslation(['settings', 'common']);
  const isEdit = !!docType;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('file');
  const [defaultFolderId, setDefaultFolderId] = useState('');
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(docType?.name || '');
    setIcon(docType?.icon || 'file');
    setDefaultFolderId(docType?.defaultFolderId || '');
    setFields(docType?.fields?.length ? docType.fields.map((f) => ({ ...f })) : []);
  }, [isOpen, docType]);

  const updateField = (i, patch) => setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const removeField = (i) => setFields((prev) => prev.filter((_, idx) => idx !== i));
  const addField = () => setFields((prev) => [...prev, emptyField()]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('documentTypes.nameRequired', 'Name is required'));
      return;
    }
    const cleanFields = fields
      .filter((f) => f.key.trim())
      .map((f) => ({ key: f.key.trim(), type: f.type || 'text', sensitive: !!f.sensitive }));

    setSaving(true);
    try {
      const payload = { name: name.trim(), icon: icon.trim() || 'file', defaultFolderId: defaultFolderId || null, fields: cleanFields };
      if (isEdit) {
        await documentTypesApi.update(docType.id, payload);
        toast.success(t('documentTypes.updated', 'Document type updated'));
      } else {
        await documentTypesApi.create(payload);
        toast.success(t('documentTypes.created', 'Document type created'));
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('documentTypes.saveFailed', 'Could not save this document type.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? t('documentTypes.editTitle', 'Edit document type') : t('documentTypes.newTitle', 'New document type')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t('common:actions.save', 'Save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={t('documentTypes.nameLabel', 'Name')}
            placeholder={t('documentTypes.namePlaceholder', 'e.g. Passport')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label={t('documentTypes.iconLabel', 'Icon')}
            placeholder={t('documentTypes.iconPlaceholder', 'e.g. passport')}
            help={t('documentTypes.iconHelp', 'A short icon key/name')}
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
          />
        </div>

        <FormField label={t('documentTypes.defaultFolderLabel', 'Default folder (optional)')}>
          <select
            className="w-full min-h-[44px] rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3"
            value={defaultFolderId}
            onChange={(e) => setDefaultFolderId(e.target.value)}
          >
            <option value="">{t('documentTypes.noneOption', 'None')}</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </FormField>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t('documentTypes.customFields', 'Custom fields')}</p>
            <Button variant="ghost" size="sm" onClick={addField}>
              + {t('documentTypes.addField', 'Add field')}
            </Button>
          </div>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 p-2">
                <input
                  placeholder={t('documentTypes.fieldNamePlaceholder', 'Field name (e.g. Passport number)')}
                  value={f.key}
                  onChange={(e) => updateField(i, { key: e.target.value })}
                  className="flex-1 min-h-[44px] rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-2.5"
                />
                <select
                  value={f.type}
                  onChange={(e) => updateField(i, { type: e.target.value })}
                  className="min-h-[44px] rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-2"
                >
                  {FIELD_TYPES.map((ft) => (
                    <option key={ft} value={ft}>
                      {t(`documentTypes.fieldTypes.${ft}`, ft)}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 whitespace-nowrap px-1 min-h-[44px]">
                  <input type="checkbox" className="accent-primary-500 w-4 h-4" checked={f.sensitive} onChange={(e) => updateField(i, { sensitive: e.target.checked })} />
                  {t('documentTypes.sensitive', 'Sensitive')}
                </label>
                <button type="button" onClick={() => removeField(i)} className="text-xs text-red-600 dark:text-red-400 px-2 min-h-[44px]">
                  {t('documentTypes.removeField', 'Remove')}
                </button>
              </div>
            ))}
            {fields.length === 0 && <p className="text-xs text-neutral-400">{t('documentTypes.noFieldsYet', 'No custom fields yet.')}</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Settings > Document Types tab — admin only. CRUD on `/document-types` templates. */
export default function SettingsDocumentTypes() {
  const { t } = useTranslation(['settings', 'common']);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['document-types'], queryFn: () => documentTypesApi.list() });
  const { data: folderData } = useQuery({ queryKey: ['folders-tree'], queryFn: () => foldersApi.tree() });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const types = data?.items || [];
  const folders = folderData?.items || [];
  const folderName = (id) => folders.find((f) => f.id === id)?.name;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['document-types'] });

  const handleDelete = async () => {
    await documentTypesApi.remove(deleteTarget.id);
    toast.success(t('documentTypes.deleted', 'Document type deleted'));
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + {t('documentTypes.newType', 'New type')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : types.length === 0 ? (
        <EmptyState
          title={t('documentTypes.emptyTitle', 'No document types yet')}
          description={t('documentTypes.emptyDescription', 'Create templates like Passport or Insurance to speed up uploads.')}
        />
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden sm:block">
            <Card>
              <Table
                rows={types}
                rowKey={(t2) => t2.id}
                columns={[
                  { key: 'name', label: t('documentTypes.columns.name', 'Name'), render: (dt) => <span className="font-medium">{dt.name}</span> },
                  { key: 'icon', label: t('documentTypes.columns.icon', 'Icon'), render: (dt) => <Badge tone="gray">{dt.icon}</Badge> },
                  { key: 'fields', label: t('documentTypes.columns.fields', 'Fields'), render: (dt) => `${dt.fields?.length || 0}` },
                  { key: 'folder', label: t('documentTypes.columns.defaultFolder', 'Default folder'), render: (dt) => folderName(dt.defaultFolderId) || '—' },
                  {
                    key: 'actions',
                    label: '',
                    align: 'right',
                    render: (dt) => (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(dt);
                            setFormOpen(true);
                          }}
                        >
                          {t('common:actions.edit', 'Edit')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(dt)}>
                          {t('common:actions.delete', 'Delete')}
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          </div>

          {/* Mobile card list — matches the pattern used by Members/Shares for wide tables */}
          <div className="sm:hidden space-y-3">
            {types.map((dt) => (
              <Card key={dt.id}>
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{dt.name}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge tone="gray">{dt.icon}</Badge>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          {t('documentTypes.columns.fields', 'Fields')}: {dt.fields?.length || 0}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[44px]"
                        onClick={() => {
                          setEditing(dt);
                          setFormOpen(true);
                        }}
                      >
                        {t('common:actions.edit', 'Edit')}
                      </Button>
                      <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => setDeleteTarget(dt)}>
                        {t('common:actions.delete', 'Delete')}
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t('documentTypes.columns.defaultFolder', 'Default folder')}: {folderName(dt.defaultFolderId) || '—'}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}

      <DocumentTypeFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} docType={editing} folders={folders} onSaved={invalidate} />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget ? t('documentTypes.deleteTitleNamed', 'Delete "{{name}}"?', { name: deleteTarget.name }) : t('documentTypes.deleteTitleGeneric', 'Delete document type?')}
        description={t('documentTypes.deleteDescription', 'Existing documents keep their saved fields; this only removes the template for new uploads.')}
        confirmLabel={t('common:actions.delete', 'Delete')}
      />
    </div>
  );
}
