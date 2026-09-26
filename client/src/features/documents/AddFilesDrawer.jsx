import { useTranslation } from 'react-i18next';
import { Camera, Upload } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import QueuedFiles from './crop/QueuedFiles.jsx';
import ScanStatus from '@/features/scan/ScanStatus.jsx';

/**
 * The document page's "Add files" step: the picked files with their auto-cropped thumbnails,
 * "Edit crop" for each photo, more files or photos, then Upload. PDFs are listed as they are.
 *
 * Props: isOpen, files (useCropQueue), picker (useFilePicker, for adding more), busy (camera or
 * crop editor open on top — Escape belongs to them), reading (the text is still being read),
 * waiting (Upload was pressed while reading — it starts by itself when done), onUpload(), onCancel()
 */
export default function AddFilesDrawer({ isOpen, files, picker, busy = false, reading = false, waiting = false, onUpload, onCancel }) {
  const { t } = useTranslation(['documents', 'common']);
  const { queue } = files;
  const detecting = queue.some((q) => q.detecting);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onCancel}
      side="right"
      size="sm"
      closeOnEscape={!busy}
      title={t('fileGallery.addFiles', 'Add files')}
      description={t('fileGallery.addHint', 'Check the crop of each photo, then upload.')}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={onUpload} disabled={!queue.length || detecting} loading={waiting} leftIcon={<Upload className="h-4 w-4" aria-hidden="true" />}>
            {t('fileGallery.uploadCount', 'Upload ({{count}})', { count: queue.length })}
          </Button>
        </>
      }
    >
      <QueuedFiles queue={queue} onEditCrop={files.editCrop} onRemove={files.remove} />
      <ScanStatus scanning={reading} />
      <div className={`flex flex-wrap gap-2 ${queue.length ? 'mt-3' : ''}`}>
        <Button variant="secondary" size="sm" leftIcon={<Upload className="h-4 w-4" aria-hidden="true" />} onClick={picker.openFiles}>
          {t('add.chooseFiles', 'Choose files')}
        </Button>
        <Button variant="secondary" size="sm" leftIcon={<Camera className="h-4 w-4" aria-hidden="true" />} onClick={picker.openCamera}>
          {t('add.takePhoto', 'Take photo')}
        </Button>
      </div>
    </Drawer>
  );
}
