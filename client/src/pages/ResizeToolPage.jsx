import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { FileDropzone } from '@/components/ui/FileDropzone.jsx';
import ResizeEditor from '@/features/resize/ResizeEditor.jsx';

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

/**
 * `/tools/resize` — standalone "Resize & compress" tool: pick an image, choose a preset
 * (passport photo, signature, exam-form sizes…) or a custom size, crop, download.
 * Everything happens on this device; nothing is saved into the vault.
 */
export default function ResizeToolPage() {
  const { t } = useTranslation('resize');
  const [file, setFile] = useState(null);

  const handleFiles = (accepted, rejected) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      return;
    }
    if (rejected?.length) toast.error(t('notAnImage', 'Please choose a photo or image file (JPG, PNG, WEBP).'));
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader
        title={t('page.title', 'Resize & compress')}
        subtitle={t('page.subtitle', 'Make a photo or signature the right size for a form. It stays on your device — nothing is uploaded.')}
      />

      {file ? (
        <ResizeEditor file={file} onChangeImage={() => setFile(null)} />
      ) : (
        <FileDropzone
          onFilesSelected={handleFiles}
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple={false}
          maxFiles={1}
          maxSize={MAX_IMAGE_BYTES}
          hint={t('page.pickHint', 'JPG, PNG or WEBP photo')}
        />
      )}
    </div>
  );
}
