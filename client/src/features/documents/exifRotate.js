import { orientation as exifOrientation } from 'exifr';

/**
 * Client-side EXIF auto-rotation, applied to every image before it's added
 * to the "Add document" form or a document page, or saved from the resize tool.
 *
 * **Why this exists even though the server also touches EXIF**
 * (server/src/modules/documents/fileValidation.js, read during this build):
 * `sharp(...).rotate()` (no args = auto-orient from EXIF) is applied when
 * building the **thumbnail** for every image, and when transcoding a HEIC
 * original to JPEG — but a plain JPEG/PNG/WEBP **original** is stored
 * byte-for-byte as uploaded, EXIF tag and all, never physically rotated.
 * That's fine in a compliant browser `<img>` (CSS `image-orientation` is
 * `from-image` by default in current Chrome/Firefox/Safari) but is NOT fine
 * for: downloaded files opened in tools that ignore EXIF, this agent's own
 * canvas-based resize/crop tool (`features/resize/**`, which reads raw
 * pixels), and the full-screen viewer's CSS-transform pinch/zoom (rotating
 * an already-sideways image compounds incorrectly). Normalizing orientation
 * client-side, once, before the bytes ever leave the browser, makes both the
 * stored original and the server-built thumbnail upright and removes any
 * dependence on the viewer respecting EXIF — see this agent's final report
 * ("EXIF rotation" judgment call).
 *
 * No-ops (returns the original File unchanged) for non-JPEG images (PNG/
 * WEBP essentially never carry EXIF orientation) and for orientation 1/
 * missing, so a normal already-upright photo is never needlessly
 * re-encoded.
 *
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function autoRotateImageFile(file) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/svg+xml') return file;

  let orientation;
  try {
    orientation = await exifOrientation(file);
  } catch {
    return file; // unreadable EXIF (or none) — ship as-is
  }
  if (!orientation || orientation === 1) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const swap = orientation >= 5 && orientation <= 8;
    const width = swap ? bitmap.height : bitmap.width;
    const height = swap ? bitmap.width : bitmap.height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    switch (orientation) {
      case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
      case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
      case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
      case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
      case 7: ctx.transform(0, -1, -1, 0, height, width); break;
      case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
      default: break;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const outType = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outType, 0.92));
    if (!blob) return file;

    return new File([blob], file.name, { type: outType, lastModified: Date.now() });
  } catch {
    return file; // decoding failed (e.g. HEIC the browser can't decode) — let the server handle it
  }
}

/** Runs `autoRotateImageFile` over a list of Files, non-images pass through untouched. */
export async function autoRotateImageFiles(files) {
  return Promise.all(Array.from(files).map((f) => autoRotateImageFile(f)));
}
