/**
 * Client-side, canvas-only crop/resize/compress pipeline for the resize
 * tool. No server round-trip: `react-easy-crop` gives us the crop
 * rectangle (in source-image pixels), we draw it onto an output-sized
 * canvas, then binary-search JPEG quality (and, if that alone can't hit the
 * target, progressively downscale too) until the encoded blob is under the
 * requested KB budget.
 */

/** Loads a File/Blob/object-URL into an `HTMLImageElement`. */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Draws `croppedAreaPixels` (react-easy-crop's `onCropComplete` output — a
 * rectangle in the *source image's* pixel space) onto a new canvas resized
 * to `outputWidth`x`outputHeight`. `background` fills the canvas first
 * (matters for a transparent PNG source going to a JPEG/no-alpha output, and
 * for signature/passport presets that want a plain white backing).
 */
export async function cropToCanvas(imageSrc, croppedAreaPixels, outputWidth, outputHeight, background) {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, outputWidth, outputHeight);
  }
  ctx.drawImage(
    img,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );
  return canvas;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

function scaledCanvas(source, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Binary-searches JPEG/WEBP quality to land the encoded blob under
 * `maxBytes`, downscaling the canvas (in 0.85x steps, up to `maxDownscales`
 * times) if quality alone can't get there. PNG has no quality knob — for
 * `format: 'png'` we only downscale, never quality-search.
 *
 * Returns `{ blob, width, height, quality }`.
 */
export async function compressToTarget(sourceCanvas, { format = 'jpeg', maxBytes, minQuality = 0.35, maxDownscales = 6 } = {}) {
  const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';

  if (!maxBytes) {
    const blob = await canvasToBlob(sourceCanvas, mime, 0.9);
    return { blob, width: sourceCanvas.width, height: sourceCanvas.height, quality: 0.9 };
  }

  let canvas = sourceCanvas;
  for (let attempt = 0; attempt <= maxDownscales; attempt += 1) {
    if (mime === 'image/png') {
      const blob = await canvasToBlob(canvas, mime);
      if (blob.size <= maxBytes || attempt === maxDownscales) {
        return { blob, width: canvas.width, height: canvas.height, quality: null };
      }
      canvas = scaledCanvas(canvas, 0.85);
      continue;
    }

    // Binary search quality in [minQuality, 0.95] for this canvas size.
    let lo = minQuality;
    let hi = 0.95;
    let best = null;
    for (let i = 0; i < 7; i += 1) {
      const mid = (lo + hi) / 2;
      // eslint-disable-next-line no-await-in-loop
      const blob = await canvasToBlob(canvas, mime, mid);
      if (blob.size <= maxBytes) {
        best = { blob, quality: mid };
        lo = mid; // room to try a higher quality that might still fit
      } else {
        hi = mid;
      }
    }
    if (best) {
      return { blob: best.blob, width: canvas.width, height: canvas.height, quality: best.quality };
    }
    if (attempt === maxDownscales) {
      // Never hit budget even at the quality floor — ship the smallest we found.
      const blob = await canvasToBlob(canvas, mime, minQuality);
      return { blob, width: canvas.width, height: canvas.height, quality: minQuality };
    }
    canvas = scaledCanvas(canvas, 0.85);
  }
  // Unreachable, but keep the linter happy.
  const blob = await canvasToBlob(canvas, mime, minQuality);
  return { blob, width: canvas.width, height: canvas.height, quality: minQuality };
}

export function bytesToKB(bytes) {
  return Math.round((bytes / 1024) * 10) / 10;
}
