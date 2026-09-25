import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button.jsx';
import Skeleton from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ItemForm from '@/features/items/ItemForm.jsx';
import { useItem } from '@/features/items/itemsHooks.js';
import AddPageHeader from '../add/AddPageHeader.jsx';
import { useGoBack } from '../add/useGoBack.js';

/** `/items/:id/edit` — the add form in edit mode, filled with the saved values. */
export default function ItemEdit() {
  const { t } = useTranslation(['items', 'common']);
  const { id } = useParams();
  const { data: item, isLoading, isError } = useItem(id);
  const goBack = useGoBack(`/items/${id}`);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <Skeleton height={28} width="50%" />
        <Skeleton height={320} rounded="lg" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <EmptyState
          title={t('detail.notFoundTitle', 'Not found')}
          description={t('detail.notFoundDescription', 'It may have been moved to the Bin.')}
          action={<Button as={Link} to="/browse">{t('detail.goToFolders', 'Go to folders')}</Button>}
        />
      </div>
    );
  }

  const kind = item.kind === 'note' ? 'note' : 'login';
  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <AddPageHeader
        title={kind === 'note' ? t('edit.noteTitle', 'Edit note') : t('edit.passwordTitle', 'Edit password')}
        onBack={goBack}
        showWhere={false}
      />
      <ItemForm key={item.id} kind={kind} mode="edit" initialItem={item} onCancel={goBack} />
    </div>
  );
}
