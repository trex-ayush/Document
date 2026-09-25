import { useRef } from 'react';
import { autoRotateImageFile } from './exifRotate.js';

/** What a document's files may be: PDFs and photos (HEIC is converted by the server). */
export const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf';

/** Straightens sideways phone photos before they are uploaded (see exifRotate.js). */
export function prepareFiles(files) {
  return Promise.all(Array.from(files).map((f) => autoRotateImageFile(f)));
}

/** Plain-words message for a failed upload. */
export function uploadErrorMessage(err, t) {
  if (err?.response?.data?.code === 'FILE_TOO_LARGE') {
    return t('documents:upload.toasts.fileTooBig', 'This file is too big to upload. Try a smaller photo or PDF.');
  }
  return err?.response?.data?.message || t('documents:upload.toasts.uploadFailed', 'Upload failed');
}

/**
 * Two hidden file inputs — "Choose files" and "Take photo" (opens the phone camera) — driven by
 * normal buttons. Render `inputs` once; call `openFiles()` / `openCamera()` from a click.
 */
export function useFilePicker({ onFiles, multiple = true }) {
  const filesRef = useRef(null);
  const cameraRef = useRef(null);

  const handleChange = (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (list.length) onFiles(list);
  };

  const inputs = (
    <>
      <input
        ref={filesRef}
        type="file"
        multiple={multiple}
        accept={FILE_ACCEPT}
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );

  return {
    inputs,
    openFiles: () => filesRef.current?.click(),
    openCamera: () => cameraRef.current?.click(),
  };
}
