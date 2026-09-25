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
import { useTranslation } from 'react-i18next';

import itemsApi from '@/services/itemsApi.js';
import useRevealSecret from '@/features/items/useRevealSecret.js';

const KIND_ICON = { login: KeyIcon, record: HashIcon, note: NoteIcon };

function CopyButton({ value }) {
  const { t } = useTranslation(['items', 'common']);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('detail.copyFailed', 'Could not copy to clipboard.'));
    }
  };
  return (
    <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" onClick={copy}>
      {copied ? t('common:actions.copied', 'Copied') : t('common:actions.copy', 'Copy')}
    </Button>
  );
}

function FieldRow({ field, values, revealingId, reveal, hide }) {
  const { t } = useTranslation('items');
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
      if (err?.message !== 'REAUTH_CANCELLED') toast.error(err?.response?.data?.message || t('detail.revealFailed', 'Could not reveal this value.'));
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
          <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" onClick={onToggle} loading={revealingId === field.id}>
            {revealed !== undefined ? t('detail.hide', 'Hide') : t('detail.reveal', 'Reveal')}
          </Button>
        )}
        {(shown || field.value) && <CopyButton value={field.sensitive ? revealed : field.value} />}
      </div>
    </div>
  );
}

/** `/items/:id` — detail view with reveal-on-demand for sensitive fields. */
export default function ItemDetail() {
  const { t } = useTranslation(['items', 'common']);
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
      toast.success(t('detail.deleteSuccess', 'Item deleted'));
      navigate('/items', { replace: true });
    },
    onError: (err) => toast.error(err?.response?.data?.message || t('detail.deleteFailed', 'Could not delete this item.')),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <EmptyState
        title={t('detail.notFoundTitle', 'Item not found')}
        description={t('detail.notFoundDescription', 'It may have been deleted.')}
        action={<Button as={Link} to="/items">{t('detail.backToItems', 'Back to items')}</Button>}
      />
    );
  }

  const kindLabels = {
    login: t('kinds.login', 'Password / login'),
    record: t('kinds.record', 'Number / record'),
    note: t('kinds.note', 'Secure note'),
  };
  const Icon = KIND_ICON[item.kind] || KIND_ICON.record;
  const kindLabel = kindLabels[item.kind] || kindLabels.record;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={item.title}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5" /> {kindLabel}
          </span>
        }
        actions={
          <>
            <Button as={Link} to={`/items/${item.id}/edit`} variant="secondary">
              {t('common:actions.edit', 'Edit')}
            </Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              {t('common:actions.delete', 'Delete')}
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
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('detail.noFieldsYet', 'No fields yet.')}</p>
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
        title={t('detail.deleteConfirmTitle', 'Delete this item?')}
        description={t('detail.deleteConfirmDescription', "This can't be undone.")}
        confirmLabel={t('common:actions.delete', 'Delete')}
      />
    </div>
  );
}
