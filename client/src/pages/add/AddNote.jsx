import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/ui/PageContainer.jsx';
import ItemForm from '@/features/items/ItemForm.jsx';
import AddPageHeader from './AddPageHeader.jsx';
import { useGoBack } from './useGoBack.js';

/** `/add/note?folderId=` — Title and Notes. */
export default function AddNote() {
  const { t } = useTranslation('items');
  const [params] = useSearchParams();
  const urlFolderId = params.get('folderId') || null;
  const [folderId, setFolderId] = useState(urlFolderId);
  const goBack = useGoBack(urlFolderId ? `/browse/${urlFolderId}` : '/');

  return (
    <PageContainer>
      <AddPageHeader title={t('add.noteTitle', 'Write note')} folderId={folderId} onFolderChange={setFolderId} onBack={goBack} />
      <ItemForm kind="note" folderId={folderId} onCancel={goBack} />
    </PageContainer>
  );
}
