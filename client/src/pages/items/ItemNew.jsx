import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/ui/PageHeader.jsx';
import ItemForm from './ItemForm.jsx';

const VALID_KINDS = new Set(['login', 'record', 'note']);

/** `/items/new?kind=login|record|note` — matches Fab.jsx's "Add password/login" etc. exactly. */
export default function ItemNew() {
  const { t } = useTranslation('items');
  const [params] = useSearchParams();
  const kindParam = params.get('kind');
  const defaultKind = VALID_KINDS.has(kindParam) ? kindParam : 'login';

  return (
    <div>
      <PageHeader title={t('new.title', 'Add to vault')} subtitle={t('new.subtitle', 'Passwords, numbers, and secure notes stay encrypted at rest.')} />
      <ItemForm mode="create" defaultKind={defaultKind} />
    </div>
  );
}
