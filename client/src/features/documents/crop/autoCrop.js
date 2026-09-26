/**
 * Scanner-style auto-crop for document photos, entirely in the browser with a plain canvas (no
 * OpenCV — too heavy for low-end phones):
 *
 *  1. find the page: on a ~480px copy, tell the page apart from the background by colour (the
 *     background is what touches the photo's edges), keep the biggest page-coloured patch,
 *     wrap it in a convex hull and reduce that to the 4 corners that keep the most area;
 *  2. only trust it when the shape is a sensible quadrilateral that the patch really fills
 *     (geometry.js isConfidentQuad) — otherwise the whole photo is kept;
 *  3. flatten: turn the photo by the chosen quarter turns, then map the 4 corners onto a flat
 *     rectangle (perspective warp, bilinear) at up to 2400px on the long side, as a JPEG.
 *
 * Detection runs on the small copy; the warp reads a copy of the full photo capped at 2800px.
 */
import { clampQuad, flatSize, fullQuad, homography, isConfidentQuad, orderCorners, polygonArea, rotateQuad } from './geometry.js';

const DETECT_SIDE = 480;
const WORK_SIDE = 2800;
const OUTPUT_SIDE = 2400;
const JPEG_QUALITY = 0.9;

/** Decodes an image File (EXIF orientation already applied by exifRotate.js). */
export async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const sizeOf = (src) => ({ width: src.naturalWidth || src.width, height: src.naturalHeight || src.height });

function drawScaled(src, maxSide) {
  const { width, height } = sizeOf(src);
  const s = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * s));
  canvas.height = Math.max(1, Math.round(height * s));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, scale: s };
}

/** Otsu's threshold for values in 0..255. */
function otsu(values) {
  const hist = new Float64Array(256);
  for (let i = 0; i < values.length; i += 1) hist[values[i]] += 1;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** One pass of a 3×3 dilation (grow = true) or erosion on a 0/1 mask. */
function morph(mask, w, h, grow) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let hit = !grow;
      for (let dy = -1; dy <= 1 && hit !== grow; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = mask[yy * w + xx];
          if (grow && v) { hit = true; break; }
          if (!grow && !v) { hit = false; break; }
        }
      }
      out[y * w + x] = hit ? 1 : 0;
    }
  }
  return out;
}

/** The biggest 4-connected patch of 1s: its pixel count and, per row, its leftmost/rightmost x. */
function largestComponent(mask, w, h) {
  const label = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best = { size: 0, id: 0 };
  let id = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || label[start]) continue;
    id += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = id; queue[tail++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = id; queue[tail++] = p + 1; }
      if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = id; queue[tail++] = p - w; }
      if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = id; queue[tail++] = p + w; }
    }
    if (tail > best.size) best = { size: tail, id };
  }
  if (!best.size) return null;
  const points = [];
  for (let y = 0; y < h; y += 1) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < w; x += 1) {
      if (label[y * w + x] === best.id) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left >= 0) points.push({ x: left, y }, { x: right + 1, y }, { x: left, y: y + 1 }, { x: right + 1, y: y + 1 });
  }
  return { size: best.size, points };
}

/** Convex hull (monotone chain). */
function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Reduces a convex hull to 4 corners, each time dropping the point whose removal loses least area. */
export function hullToQuad(hull) {
  const pts = [...hull];
  if (pts.length < 4) return null;
  while (pts.length > 4) {
    let bestIdx = 0;
    let bestLoss = Infinity;
    for (let i = 0; i < pts.length; i += 1) {
      const loss = polygonArea([pts[(i - 1 + pts.length) % pts.length], pts[i], pts[(i + 1) % pts.length]]);
      if (loss < bestLoss) {
        bestLoss = loss;
        bestIdx = i;
      }
    }
    pts.splice(bestIdx, 1);
  }
  return orderCorners(pts);
}

/**
 * Finds the page in a photo. Returns its 4 corners in the photo's own pixels, or `null` when not
 * sure (then keep the whole photo).
 */
export function detectQuad(src) {
  const { width: W, height: H } = sizeOf(src);
  const { canvas, ctx, scale } = drawScaled(src, DETECT_SIDE);
  const w = canvas.width;
  const h = canvas.height;
  const { data } = ctx.getImageData(0, 0, w, h);

  // Background colour: what lines the photo's edges.
  const margin = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  let n = 0;
  const mean = [0, 0, 0];
  const sq = [0, 0, 0];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (x >= margin && x < w - margin && y >= margin && y < h - margin) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        mean[c] += data[i + c];
        sq[c] += data[i + c] * data[i + c];
      }
      n += 1;
    }
  }
  const variance = [0, 1, 2].map((c) => Math.max(60, sq[c] / n - (mean[c] / n) ** 2));
  for (let c = 0; c < 3; c += 1) mean[c] /= n;

  // How unlike the background each pixel is (0..255), then split page from background (Otsu).
  const diff = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p += 1, i += 4) {
    let d = 0;
    for (let c = 0; c < 3; c += 1) d += (data[i + c] - mean[c]) ** 2 / variance[c];
    diff[p] = Math.min(255, Math.round(Math.sqrt(d) * 24));
  }
  const threshold = Math.max(40, otsu(diff));
  let mask = new Uint8Array(w * h);
  for (let p = 0; p < mask.length; p += 1) mask[p] = diff[p] > threshold ? 1 : 0;

  // Close small holes (text, photos on the card), then drop specks.
  mask = morph(mask, w, h, true);
  mask = morph(mask, w, h, true);
  mask = morph(mask, w, h, false);
  mask = morph(mask, w, h, false);

  const comp = largestComponent(mask, w, h);
  if (!comp) return null;
  const quad = hullToQuad(convexHull(comp.points));
  if (!quad) return null;
  const fill = comp.size / Math.max(1, polygonArea(quad));
  if (!isConfidentQuad(quad, w, h, { fill })) return null;
  return clampQuad(quad.map((p) => ({ x: p.x / scale, y: p.y / scale })), W, H);
}

/** A canvas of `src` turned by `turns` quarter turns clockwise (0–3), at most `maxSide` long. */
export function rotatedCanvas(src, turns, maxSide) {
  const { canvas: flat, scale } = drawScaled(src, maxSide);
  const t = ((turns % 4) + 4) % 4;
  if (!t) return { canvas: flat, scale };
  const canvas = document.createElement('canvas');
  canvas.width = t % 2 ? flat.height : flat.width;
  canvas.height = t % 2 ? flat.width : flat.height;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((t * Math.PI) / 2);
  ctx.drawImage(flat, -flat.width / 2, -flat.height / 2);
  return { canvas, scale };
}

/** Size of the photo after `turns` quarter turns. */
export function turnedSize(src, turns) {
  const { width, height } = sizeOf(src);
  return turns % 2 ? { width: height, height: width } : { width, height };
}

/** A quad in the photo's own pixels, carried through `turns` quarter turns clockwise. */
export function turnQuad(quad, src, turns) {
  let q = quad;
  let { width, height } = sizeOf(src);
  for (let i = 0; i < ((turns % 4) + 4) % 4; i += 1) {
    q = rotateQuad(q, width, height, 1);
    [width, height] = [height, width];
  }
  return q;
}

/**
 * Renders the final file: the photo turned by `turns`, then `quad` (in the turned photo's pixels;
 * `null` = the whole photo) flattened into a rectangle. Returns a JPEG File named like `name`.
 */
export async function renderCrop(src, { turns = 0, quad = null }, name = 'photo.jpg') {
  const { canvas: work, scale } = rotatedCanvas(src, turns, WORK_SIDE);
  const q = (quad || fullQuad(work.width / scale, work.height / scale)).map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const size = flatSize(q);
  const shrink = Math.min(1, OUTPUT_SIDE / Math.max(size.width, size.height));
  const ow = Math.max(1, Math.round(size.width * shrink));
  const oh = Math.max(1, Math.round(size.height * shrink));
  const out = document.createElement('canvas');
  out.width = ow;
  out.height = oh;
  const octx = out.getContext('2d');

  if (!quad) {
    octx.drawImage(work, 0, 0, ow, oh);
  } else {
    const sw = work.width;
    const sh = work.height;
    const src32 = work.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const img = octx.createImageData(ow, oh);
    const dst = img.data;
    // Output pixel -> photo pixel.
    const Hm = homography(fullQuad(ow, oh), q);
    for (let y = 0; y < oh; y += 1) {
      // Row start and per-pixel steps of the projective numerators/denominator.
      let X = Hm[1] * y + Hm[2];
      let Y = Hm[4] * y + Hm[5];
      let Z = Hm[7] * y + Hm[8];
      for (let x = 0; x < ow; x += 1) {
        const fx = X / Z;
        const fy = Y / Z;
        const x0 = Math.min(sw - 2, Math.max(0, Math.floor(fx)));
        const y0 = Math.min(sh - 2, Math.max(0, Math.floor(fy)));
        const ax = Math.min(1, Math.max(0, fx - x0));
        const ay = Math.min(1, Math.max(0, fy - y0));
        const i00 = (y0 * sw + x0) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + sw * 4;
        const i11 = i01 + 4;
        const o = (y * ow + x) * 4;
        for (let c = 0; c < 3; c += 1) {
          const top = src32[i00 + c] + (src32[i10 + c] - src32[i00 + c]) * ax;
          const bottom = src32[i01 + c] + (src32[i11 + c] - src32[i01 + c]) * ax;
          dst[o + c] = top + (bottom - top) * ay;
        }
        dst[o + 3] = 255;
        X += Hm[0];
        Y += Hm[3];
        Z += Hm[6];
      }
    }
    octx.putImageData(img, 0, 0);
  }

  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  const base = String(name).replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

/**
 * Photo → `{ file, original, crop: { turns, quad, detected } }`: the auto-cropped file (or the
 * photo untouched when no page was found with confidence) plus what the editor needs to change it.
 */
export async function autoCropFile(file) {
  const src = await loadBitmap(file);
  const detected = detectQuad(src);
  if (!detected) return { file, original: file, crop: { turns: 0, quad: null, detected: null } };
  const cropped = await renderCrop(src, { turns: 0, quad: detected }, file.name);
  return { file: cropped, original: file, crop: { turns: 0, quad: detected, detected } };
}
