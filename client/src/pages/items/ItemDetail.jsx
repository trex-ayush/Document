import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import PageHeader from '@/components/ui/PageHeader.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Button from '@/components/ui/Button.jsx';
import TagChip from '@/components/ui/TagChip.jsx';
import ConfirmModal from '@/components/ui/ConfirmModal.jsx';
import { KeyIcon, HashIcon, NoteIcon } from '@/components/layout/icons.jsx';

import itemsApi from '@/services/itemsApi.js';
import useRevealSecret from '@/features/items/useRevealSecret.js';

const KIND_META = { login: { icon: KeyIcon, label: 'Password / login' }, record: { icon: HashIcon, label: 'Number / record' }, note: { icon: NoteIcon, label: 'Secure note' } };

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };
  return (
    <Button type="button" variant="ghost" size="sm" onClick={copy}>
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function FieldRow({ field, values, revealingId, reveal, hide }) {
  const revealed = values[field.id];
  const shown = field.sensitive ? revealed : field.value;

  const onToggle = async () => {
    if (revealed !== undefined) {
      hide(field.id);
      return;
    }
    try {
      await reveal(field.id);
    } catch (err) {
      if (err?.message !== 'REAUTH_CANCELLED') toast.error(err?.response?.data?.message || 'Could not reveal this value.');
    }
  };

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-neutral-100 dark:border-neutral-700 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{field.key}</p>
        <p className="text-sm text-neutral-900 dark:text-neutral-100 truncate font-mono">
          {field.sensitive ? (revealed !== undefined ? shown : field.masked || '••••') : shown || '—'}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {field.sensitive && (
          <Button type="button" variant="ghost" size="sm" onClick={onToggle} loading={revealingId === field.id}>
            {revealed !== undefined ? 'Hide' : 'Reveal'}
          </Button>
        )}
        {(shown || field.value) && <CopyButton value={field.sensitive ? revealed : field.value} />}
      </div>
    </div>
  );
}

/** `/items/:id` — detail view with reveal-on-demand for sensitive fields. */
export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: item, isLoading, isError } = useQuery({ queryKey: ['items', id], queryFn: () => itemsApi.get(id) });
  const { values, revealingId, reveal, hide, reauthModal } = useRevealSecret(id);

  const deleteMutation = useMutation({
    mutationFn: () => itemsApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Item deleted');
      navigate('/items', { replace: true });
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Could not delete this item.'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !item) {
    return <EmptyState title="Item not found" description="It may have been deleted." action={<Button as={Link} to="/items">Back to items</Button>} />;
  }

  const meta = KIND_META[item.kind] || KIND_META.record;
  const Icon = meta.icon;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={item.title}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5" /> {meta.label}
          </span>
        }
        actions={
          <>
            <Button as={Link} to={`/items/${item.id}/edit`} variant="secondary">
              Edit
            </Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Delete
            </Button>
          </>
        }
      />

      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {item.tags.map((tag) => (
            <TagChip key={tag} tag={{ name: tag }} />
          ))}
        </div>
      )}

      <Card>
        <CardBody>
          {item.fields.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No fields yet.</p>
          ) : (
            item.fields.map((field) => (
              <FieldRow key={field.id} field={field} values={values} revealingId={revealingId} reveal={reveal} hide={hide} />
            ))
          )}
        </CardBody>
      </Card>

      {reauthModal}

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteMutation.mutateAsync()}
        title="Delete this item?"
        description="This can't be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}
