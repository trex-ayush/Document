import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Textarea from '@/components/ui/Textarea.jsx';
import TagChip from '@/components/ui/TagChip.jsx';
import Skeleton from '@/components/ui/Skeleton.jsx';
import ConfirmModal from '@/components/ui/ConfirmModal.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs.jsx';
import FolderPicker from '@/features/folders/FolderPicker.jsx';
import { useDocument, useUpdateDocument, useDeleteDocument, useDocumentTypes, useMembers, useDocumentZip } from '@/features/documents/documentsHooks.js';
import FileGallery from '@/features/documents/FileGallery.jsx';
import CustomFieldsEditor from '@/features/documents/CustomFieldsEditor.jsx';
import DocumentActivityTab from '@/features/documents/DocumentActivityTab.jsx';
import { downloadZipFrom } from '@/features/documents/zipDownload.js';
import CommandPalette from '@/features/search/CommandPalette.jsx';

/** Document detail + viewer (`document/:id`). */
export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: doc, isLoading } = useDocument(id);
  const { data: typesData } = useDocumentTypes();
  const { data: membersData } = useMembers();
  const update = useUpdateDocument(id);
  const del = useDeleteDocument();
  const zip = useDocumentZip();

  const [form, setForm] = useState(null);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setForm({
      title: doc.title,
      typeId: doc.typeId || '',
      memberId: doc.memberId || '',
      tagsText: (doc.tags || []).join(', '),
      notes: doc.notes || '',
      expiryDate: doc.expiryDate ? doc.expiryDate.slice(0, 10) : '',
    });
  }, [doc]);

  if (isLoading || !form) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton height={32} width="40%" />
        <Skeleton height={200} rounded="lg" />
      </div>
    );
  }

  const isDirty =
    form.title !== doc.title ||
    form.typeId !== (doc.typeId || '') ||
    form.memberId !== (doc.memberId || '') ||
    form.tagsText !== (doc.tags || []).join(', ') ||
    form.notes !== (doc.notes || '') ||
    form.expiryDate !== (doc.expiryDate ? doc.expiryDate.slice(0, 10) : '');

  const handleSaveDetails = async () => {
    try {
      await update.mutateAsync({
        title: form.title.trim(),
        typeId: form.typeId || null,
        memberId: form.memberId || null,
        tags: form.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
        notes: form.notes,
        expiryDate: form.expiryDate || null,
      });
      toast.success('Document updated');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save changes');
    }
  };

  const handleMove = (folderId) => {
    update.mutate(
      { folderId },
      {
        onSuccess: () => toast.success('Document moved'),
        onError: (err) => toast.error(err?.response?.data?.message || 'Could not move the document'),
      },
    );
  };

  const handleDelete = async () => {
    await del.mutateAsync(id);
    toast.success('Document deleted');
    navigate(doc.folderId ? `/browse/${doc.folderId}` : '/browse');
  };

  const handleDownloadAll = () => downloadZipFrom(zip.mutateAsync({ id }), `${doc.title}.zip`);

  const selectClass = 'h-11 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100';

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24 sm:p-6">
      <PageHeader
        title={doc.title}
        breadcrumb={
          <nav className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => navigate('/browse')} className="hover:underline">All folders</button>
            {(doc.breadcrumbs || []).map((b) => (
              <span key={b.id} className="flex items-center gap-1">
                <span>/</span>
                <button type="button" onClick={() => navigate(`/browse/${b.id}`)} className="hover:underline">{b.name}</button>
              </span>
            ))}
          </nav>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {(doc.files?.length || 0) > 1 && <Button variant="secondary" onClick={handleDownloadAll}>Download all (ZIP)</Button>}
            <Button variant="secondary" onClick={() => setMovePickerOpen(true)}>Move</Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete</Button>
          </div>
        }
      />

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="files">Files ({doc.files?.length || 0})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="space-y-4">
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">Document type</label>
                <select className={selectClass} value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })}>
                  <option value="">None</option>
                  {(typesData?.items || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">Family member</label>
                <select className={selectClass} value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {(membersData?.items || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>

            <Input label="Tags" value={form.tagsText} onChange={(e) => setForm({ ...form, tagsText: e.target.value })} placeholder="comma separated" />
            {form.tagsText.trim() && (
              <div className="flex flex-wrap gap-1.5">
                {form.tagsText.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <TagChip key={t} tag={{ name: t }} />)}
              </div>
            )}

            <Input label="Expiry date" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            <Textarea label="Notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

            {isDirty && (
              <div className="flex justify-end">
                <Button onClick={handleSaveDetails} loading={update.isPending}>Save changes</Button>
              </div>
            )}

            <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
              <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">Custom fields</p>
              <CustomFieldsEditor documentId={id} fields={doc.customFields || []} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="files">
          <FileGallery document={doc} />
        </TabsContent>

        <TabsContent value="activity">
          <DocumentActivityTab documentId={id} />
        </TabsContent>
      </Tabs>

      <FolderPicker
        isOpen={movePickerOpen}
        onClose={() => setMovePickerOpen(false)}
        onPick={handleMove}
        initialFolderId={doc.folderId}
        title="Move document to…"
      />

      <ConfirmModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={`Delete "${doc.title}"?`}
        description="This permanently deletes the document and all of its files. This can't be undone."
        confirmLabel="Delete"
      />

      <CommandPalette />
    </div>
  );
}
