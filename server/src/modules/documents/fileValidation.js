import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { env } from '../../config/env.js';
import { ApiError } from '../../middleware/errorHandler.js';

// Allowed types per spec — extension/header claims are never trusted, only magic-byte sniffing
// (`file-type`) decides what a file actually is. SVG is deliberately NOT in this list: it isn't a
// safe "image" (can embed script), so it's rejected the same way any other unrecognized type is.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HEIC_MIME = new Set(['image/heic', 'image/heif']);

const THUMB_WIDTH = 400;

/**
 * Validate a raw upload buffer and prepare it for storage: magic-byte type check, size check,
 * HEIC->JPEG transcode (this server's sharp/libvips build has libheif compiled in — verified via
 * `sharp.format.heif` at build time — so HEIC decodes; if a specific file still fails to decode we
 * reject it with 400 UNSUPPORTED_FILE_TYPE rather than storing something the browser can't render
 * or silently dropping the thumbnail), dimensions, and a webp thumbnail for images.
 *
 * Returns `{ buffer, mimeType, originalName, width, height, thumbBuffer }` — `thumbBuffer` is
 * `null` for PDFs (client shows a generic file icon).
 *
 * `maxFileMB` is the CALLER's job to resolve (per-family setting, falling back to
 * `env.MAX_FILE_MB` — see `utils/effectiveSettings.js#getEffectiveFamilySettings`); defaults to
 * the env value directly if omitted, so existing/other callers don't break.
 */
export async function validateAndProcessFile(rawBuffer, originalName, maxFileMB = env.MAX_FILE_MB) {
  const maxBytes = maxFileMB * 1024 * 1024;
  if (rawBuffer.length > maxBytes) {
    throw new ApiError(413, 'FILE_TOO_LARGE', `File exceeds the ${maxFileMB}MB limit`);
  }

  const detected = await fileTypeFromBuffer(rawBuffer);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw new ApiError(
      400,
      'UNSUPPORTED_FILE_TYPE',
      detected
        ? `Unsupported file type: ${detected.mime}`
        : 'Unrecognized file type (failed magic-byte detection)',
    );
  }

  let buffer = rawBuffer;
  let mimeType = detected.mime;
  let displayName = originalName;

  if (HEIC_MIME.has(detected.mime)) {
    try {
      buffer = await sharp(rawBuffer, { failOn: 'none' }).rotate().jpeg({ quality: 90 }).toBuffer();
      mimeType = 'image/jpeg';
      displayName = renameExtension(originalName, 'jpg');
    } catch (err) {
      throw new ApiError(
        400,
        'UNSUPPORTED_FILE_TYPE',
        `Could not decode HEIC image on this server: ${err.message}`,
      );
    }
  }

  if (buffer.length > maxBytes) {
    // Re-check post-transcode size (a converted JPEG is occasionally larger than the source HEIC).
    throw new ApiError(413, 'FILE_TOO_LARGE', `File exceeds the ${env.MAX_FILE_MB}MB limit`);
  }

  let width = null;
  let height = null;
  let thumbBuffer = null;

  if (IMAGE_MIME.has(mimeType) || mimeType === 'image/jpeg') {
    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
      thumbBuffer = await sharp(buffer)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      // Defensive only — a file that already passed magic-byte + (if HEIC) transcode checks
      // should always be readable by sharp. If it somehow isn't, ship it without a thumbnail
      // rather than failing the whole upload.
      width = null;
      height = null;
      thumbBuffer = null;
    }
  }

  return { buffer, mimeType, originalName: displayName, width, height, thumbBuffer };
}

function renameExtension(name, newExt) {
  const base = String(name || 'file').replace(/\.[^./\\]+$/, '');
  return `${base}.${newExt}`;
}
