import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <AddPageHeader title={t('add.noteTitle', 'Write note')} folderId={folderId} onFolderChange={setFolderId} onBack={goBack} />
      <ItemForm kind="note" folderId={folderId} onCancel={goBack} />
    </div>
  );
}
