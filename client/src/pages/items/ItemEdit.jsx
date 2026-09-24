import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import itemsApi from '@/services/itemsApi.js';
import ItemForm from './ItemForm.jsx';
import useRevealSecret from '@/features/items/useRevealSecret.js';

/**
 * `/items/:id/edit`. `PATCH /items/:id` replaces the whole `fields` array, so before this ever
 * renders `ItemForm`, every sensitive field is revealed here (reauth-gated — one prompt covers the
 * whole batch, see useRevealSecret) so the edit form is prefilled with real values, not blanks that
 * would silently wipe a saved secret on save.
 */
export default function ItemEdit() {
  const { id } = useParams();
  const { data: item, isLoading, isError } = useQuery({ queryKey: ['items', id], queryFn: () => itemsApi.get(id) });
  const { values, reveal, reauthModal } = useRevealSecret(id);

  const sensitiveFieldIds = useMemo(
    () => (item?.fields || []).filter((f) => f.sensitive && f.hasValue).map((f) => f.id),
    [item],
  );
  const [revealError, setRevealError] = useState(null);
  // Guards against React 18 StrictMode's dev-only double-invocation of effects, which would
  // otherwise fire two overlapping reveal batches (and log `field.reveal` twice) for the same
  // item — keyed by item id so navigating from one item's edit page to another's still re-runs.
  const startedForRef = useRef(null);

  useEffect(() => {
    if (!item || sensitiveFieldIds.length === 0) return undefined;
    if (startedForRef.current === item.id) return undefined;
    startedForRef.current = item.id;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line no-restricted-syntax
      for (const fieldId of sensitiveFieldIds) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await reveal(fieldId);
        } catch (err) {
          if (!cancelled) setRevealError(err);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // sensitiveFieldIds is derived from `item` and stable per item id — only re-run when the item changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !item) {
    return <EmptyState title="Item not found" description="It may have been deleted." />;
  }

  if (revealError) {
    return (
      <>
        <EmptyState
          title="Couldn't unlock this item"
          description="Your password confirmation was cancelled or failed — go back and try again."
        />
        {reauthModal}
      </>
    );
  }

  const allRevealed = sensitiveFieldIds.every((fid) => fid in values);
  if (!allRevealed) {
    return (
      <>
        <PageHeader title={`Edit ${item.title}`} />
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
        {reauthModal}
      </>
    );
  }

  const editableItem = {
    ...item,
    fields: item.fields.map((f) => (f.sensitive ? { ...f, value: values[f.id] ?? '' } : f)),
  };

  return (
    <div>
      <PageHeader title={`Edit ${item.title}`} />
      <ItemForm mode="edit" initialItem={editableItem} />
      {reauthModal}
    </div>
  );
}
