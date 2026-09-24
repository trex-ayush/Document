import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
      toast.error('Name is required');
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
        toast.success('Document type updated');
      } else {
        await documentTypesApi.create(payload);
        toast.success('Document type created');
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save this document type.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit document type' : 'New document type'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Name" placeholder="e.g. Passport" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Icon" placeholder="e.g. passport" help="A short icon key/name" value={icon} onChange={(e) => setIcon(e.target.value)} />
        </div>

        <FormField label="Default folder (optional)">
          <select
            className="w-full min-h-[44px] rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3"
            value={defaultFolderId}
            onChange={(e) => setDefaultFolderId(e.target.value)}
          >
            <option value="">None</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </FormField>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Custom fields</p>
            <Button variant="ghost" size="sm" onClick={addField}>
              + Add field
            </Button>
          </div>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 p-2">
                <input
                  placeholder="Field name (e.g. Passport number)"
                  value={f.key}
                  onChange={(e) => updateField(i, { key: e.target.value })}
                  className="flex-1 min-h-[40px] rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-2.5"
                />
                <select
                  value={f.type}
                  onChange={(e) => updateField(i, { type: e.target.value })}
                  className="min-h-[40px] rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-2"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 whitespace-nowrap px-1">
                  <input type="checkbox" className="accent-primary-500" checked={f.sensitive} onChange={(e) => updateField(i, { sensitive: e.target.checked })} />
                  Sensitive
                </label>
                <button type="button" onClick={() => removeField(i)} className="text-xs text-red-600 dark:text-red-400 px-2 min-h-[40px]">
                  Remove
                </button>
              </div>
            ))}
            {fields.length === 0 && <p className="text-xs text-neutral-400">No custom fields yet.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Settings > Document Types tab — admin only. CRUD on `/document-types` templates. */
export default function SettingsDocumentTypes() {
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
    toast.success('Document type deleted');
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
          + New type
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : types.length === 0 ? (
        <EmptyState title="No document types yet" description="Create templates like Passport or Insurance to speed up uploads." />
      ) : (
        <Card>
          <Table
            rows={types}
            rowKey={(t) => t.id}
            columns={[
              { key: 'name', label: 'Name', render: (t) => <span className="font-medium">{t.name}</span> },
              { key: 'icon', label: 'Icon', render: (t) => <Badge tone="gray">{t.icon}</Badge> },
              { key: 'fields', label: 'Fields', render: (t) => `${t.fields?.length || 0}` },
              { key: 'folder', label: 'Default folder', render: (t) => folderName(t.defaultFolderId) || '—' },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (t) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(t);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(t)}>
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      <DocumentTypeFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} docType={editing} folders={folders} onSaved={invalidate} />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : 'Delete document type?'}
        description="Existing documents keep their saved fields; this only removes the template for new uploads."
        confirmLabel="Delete"
      />
    </div>
  );
}
