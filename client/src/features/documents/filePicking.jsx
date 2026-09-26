import { lazy, Suspense, useRef, useState } from 'react';
import { autoRotateImageFile } from './exifRotate.js';

const CameraCapture = lazy(() => import('./CameraCapture.jsx'));

/**
 * Phones and tablets open their own camera app from `<input capture>`; desktop browsers ignore
 * `capture` and just show a file dialog, so PCs and laptops get the in-app camera instead.
 */
function hasNativeCamera() {
  if (typeof window === 'undefined') return false;
  const touch = navigator.maxTouchPoints > 0 && window.matchMedia?.('(pointer: coarse)').matches;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  return Boolean(touch || mobileUa);
}

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
 * Two hidden file inputs — "Choose files" and "Take photo" — driven by normal buttons. Render
 * `inputs` once; call `openFiles()` / `openCamera()` from a click. "Take photo" opens the phone's
 * camera on phones and tablets, and the in-app camera (CameraCapture) on a computer.
 */
export function useFilePicker({ onFiles, multiple = true }) {
  const filesRef = useRef(null);
  const cameraRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);

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
      {cameraOpen && (
        <Suspense fallback={null}>
          <CameraCapture
            onCapture={(file) => onFiles([file])}
            onChooseFiles={() => filesRef.current?.click()}
            onClose={() => setCameraOpen(false)}
          />
        </Suspense>
      )}
    </>
  );

  return {
    inputs,
    openFiles: () => filesRef.current?.click(),
    openCamera: () => (hasNativeCamera() ? cameraRef.current?.click() : setCameraOpen(true)),
  };
}
