import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/ui/PageContainer.jsx';
import ItemForm from '@/features/items/ItemForm.jsx';
import FolderField from '@/features/folders/FolderField.jsx';
import AddPageHeader from './AddPageHeader.jsx';
import { useGoBack } from './useGoBack.js';
import RequireWrite from '@/features/members/RequireWrite.jsx';

/** `/add/password?folderId=` — Title, Username / email, Password, extra fields, Notes. */
export default function AddPassword() {
  return (
    <RequireWrite>
      <AddPasswordPage />
    </RequireWrite>
  );
}

function AddPasswordPage() {
  const { t } = useTranslation('items');
  const [params] = useSearchParams();
  const urlFolderId = params.get('folderId') || null;
  const [folderId, setFolderId] = useState(urlFolderId);
  const goBack = useGoBack(urlFolderId ? `/browse/${urlFolderId}` : '/');

  return (
    <PageContainer size="form">
      <AddPageHeader title={t('add.passwordTitle', 'Save password')} onBack={goBack} />
      <ItemForm kind="login" folderId={folderId} folderField={<FolderField folderId={folderId} onChange={setFolderId} />} onCancel={goBack} />
    </PageContainer>
  );
}
