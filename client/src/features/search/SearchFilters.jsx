import { useTranslation } from 'react-i18next';
import { useFolderTree } from '@/features/folders/foldersHooks.js';
import { useMembers, useDocumentTypes } from '@/features/documents/documentsHooks.js';

/** Folder / member / type / file-kind filter controls for the Search page (`GET /documents` params). */
export default function SearchFilters({ filters, onChange, className = '' }) {
  const { t } = useTranslation('search');
  const { data: folderData } = useFolderTree();
  const { data: memberData } = useMembers();
  const { data: typeData } = useDocumentTypes();

  const FILE_KINDS = [
    { value: '', label: t('filters.fileKind.any', 'Any file type') },
    { value: 'image', label: t('filters.fileKind.images', 'Images') },
    { value: 'pdf', label: t('filters.fileKind.pdfs', 'PDFs') },
  ];

  const set = (patch) => onChange({ ...filters, ...patch });
  const selectClass = 'h-11 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100';

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('filters.folder.label', 'Folder')}</label>
        <select className={selectClass} value={filters.folderId || ''} onChange={(e) => set({ folderId: e.target.value || undefined })}>
          <option value="">{t('filters.folder.allFolders', 'All folders')}</option>
          {(folderData?.items || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('filters.member.label', 'Member')}</label>
        <select className={selectClass} value={filters.memberId || ''} onChange={(e) => set({ memberId: e.target.value || undefined })}>
          <option value="">{t('filters.member.everyone', 'Everyone')}</option>
          {(memberData?.items || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('filters.documentType.label', 'Document type')}</label>
        <select className={selectClass} value={filters.typeId || ''} onChange={(e) => set({ typeId: e.target.value || undefined })}>
          <option value="">{t('filters.documentType.anyType', 'Any type')}</option>
          {(typeData?.items || []).map((dt) => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('filters.fileKind.label', 'File kind')}</label>
        <select className={selectClass} value={filters.fileKind || ''} onChange={(e) => set({ fileKind: e.target.value || undefined })}>
          {FILE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>
    </div>
  );
}
