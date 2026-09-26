import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { prepareFiles } from '../filePicking.jsx';

// The crop editor loads only when someone opens it.
const CropEditor = lazy(() => import('./CropEditor.jsx'));

let queueSeq = 0;

const isPhoto = (file) => file.type?.startsWith('image/') && file.type !== 'image/svg+xml';

/**
 * Files picked for upload, with scanner-style auto-crop for photos — shared by "Add document"
 * and the document page's "Add files".
 *
 * Each entry: { id, file, previewUrl, original, crop, detecting }. For a photo `file` is the
 * auto-cropped copy (the photo itself when the page isn't found with confidence) and `original`
 * the photo as picked, which the crop editor starts from. PDFs pass through untouched.
 * Photos are cropped one at a time (light on low-end phones). After a crop is edited the entry
 * gets a new id, so anything keyed on it (the scanner) reads the new picture.
 *
 * Returns { queue, add(files), remove(id), clear(), editCrop(entry), editing, cropEditor } —
 * render `cropEditor` once.
 */
export function useCropQueue() {
  const [queue, setQueue] = useState([]);
  const [cropping, setCropping] = useState(null);

  // Free the photo previews when the page or panel goes away.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(() => () => queueRef.current.forEach((q) => q.previewUrl && URL.revokeObjectURL(q.previewUrl)), []);

  const update = (id, patch) =>
    setQueue((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        if (patch.previewUrl && q.previewUrl && q.previewUrl !== patch.previewUrl) URL.revokeObjectURL(q.previewUrl);
        return { ...q, ...patch };
      }),
    );

  const add = async (files) => {
    const ready = await prepareFiles(files);
    const entries = ready.map((file) => {
      const photo = isPhoto(file);
      return {
        id: `q${queueSeq++}`,
        file,
        original: photo ? file : null,
        crop: null,
        detecting: photo,
        previewUrl: photo ? URL.createObjectURL(file) : null,
      };
    });
    setQueue((prev) => [...prev, ...entries]);
    const photos = entries.filter((e) => e.detecting);
    if (!photos.length) return;
    let autoCropFile = null;
    try {
      ({ autoCropFile } = await import('./autoCrop.js'));
    } catch {
      photos.forEach((e) => update(e.id, { detecting: false }));
      return;
    }
    for (const entry of photos) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await autoCropFile(entry.file);
        const changed = result.file !== entry.file;
        update(entry.id, {
          file: result.file,
          crop: result.crop,
          detecting: false,
          ...(changed ? { previewUrl: URL.createObjectURL(result.file) } : {}),
        });
      } catch {
        update(entry.id, { detecting: false });
      }
    }
  };

  const remove = (id) =>
    setQueue((prev) => {
      const gone = prev.find((q) => q.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((q) => q.id !== id);
    });

  const clear = () =>
    setQueue((prev) => {
      prev.forEach((q) => q.previewUrl && URL.revokeObjectURL(q.previewUrl));
      return [];
    });

  const applyCrop = (entry, { file, crop }) => {
    setQueue((prev) =>
      prev.map((q) => {
        if (q.id !== entry.id) return q;
        if (q.previewUrl) URL.revokeObjectURL(q.previewUrl);
        return { ...q, id: `q${queueSeq++}`, file, crop, previewUrl: URL.createObjectURL(file) };
      }),
    );
    setCropping(null);
  };

  const cropEditor = cropping && (
    <Suspense fallback={null}>
      <CropEditor file={cropping.original} crop={cropping.crop} onDone={(res) => applyCrop(cropping, res)} onClose={() => setCropping(null)} />
    </Suspense>
  );

  return { queue, add, remove, clear, editCrop: setCropping, editing: Boolean(cropping), cropEditor };
}
