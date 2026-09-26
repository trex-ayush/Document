import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/ui/PageContainer.jsx';
import ItemForm from '@/features/items/ItemForm.jsx';
import FolderField from '@/features/folders/FolderField.jsx';
import AddPageHeader from './AddPageHeader.jsx';
import { useGoBack } from './useGoBack.js';
import RequireWrite from '@/features/members/RequireWrite.jsx';

/** `/add/note?folderId=` — Title and Notes. */
export default function AddNote() {
  return (
    <RequireWrite>
      <AddNotePage />
    </RequireWrite>
  );
}

function AddNotePage() {
  const { t } = useTranslation('items');
  const [params] = useSearchParams();
  const urlFolderId = params.get('folderId') || null;
  const [folderId, setFolderId] = useState(urlFolderId);
  const goBack = useGoBack(urlFolderId ? `/browse/${urlFolderId}` : '/');

  return (
    <PageContainer>
      <AddPageHeader title={t('add.noteTitle', 'Write note')} onBack={goBack} />
      <ItemForm kind="note" folderId={folderId} folderField={<FolderField folderId={folderId} onChange={setFolderId} />} onCancel={goBack} />
    </PageContainer>
  );
}
