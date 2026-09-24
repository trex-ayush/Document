import { useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader.jsx';
import ItemForm from './ItemForm.jsx';

const VALID_KINDS = new Set(['login', 'record', 'note']);

/** `/items/new?kind=login|record|note` — matches Fab.jsx's "Add password/login" etc. exactly. */
export default function ItemNew() {
  const [params] = useSearchParams();
  const kindParam = params.get('kind');
  const defaultKind = VALID_KINDS.has(kindParam) ? kindParam : 'login';

  return (
    <div>
      <PageHeader title="Add to vault" subtitle="Passwords, numbers, and secure notes stay encrypted at rest." />
      <ItemForm mode="create" defaultKind={defaultKind} />
    </div>
  );
}
