import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ItemForm from '@/features/items/ItemForm.jsx';
import AddPageHeader from './AddPageHeader.jsx';
import { useGoBack } from './useGoBack.js';

/** `/add/password?folderId=` — Title, Username / email, Password, extra fields, Notes. */
export default function AddPassword() {
  const { t } = useTranslation('items');
  const [params] = useSearchParams();
  const folderId = params.get('folderId') || null;
  const goBack = useGoBack(folderId ? `/browse/${folderId}` : '/');

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <AddPageHeader title={t('add.passwordTitle', 'Save password')} folderId={folderId} onBack={goBack} />
      <ItemForm kind="login" folderId={folderId} onCancel={goBack} />
    </div>
  );
}
