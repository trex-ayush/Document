/**
 * In-browser document reader. This module is only ever loaded with a dynamic
 * `import()` once an image or PDF is added to the upload queue, and it in turn lazy-loads each heavy
 * library only when needed:
 *   - zxing-wasm  (QR decoding; wasm served from our own build output)
 *   - pdfjs-dist  (legacy build, for older phone browsers; worker self-hosted)
 *   - tesseract.js (OCR in a Web Worker; its core wasm and the eng+hin
 *     language data come from the jsDelivr CDN on first use and are cached by
 *     the browser/IndexedDB afterwards — only static files are downloaded,
 *     the document image never leaves the device)
 *
 * The queued File is never modified: every step works on a canvas copy.
 */
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { loadImage } from '@/features/resize/canvasUtils.js';
import { loadPdfjs } from '@/features/documents/pdfjs.js';
import { decodeAadhaarQr } from './aadhaarQr.js';
import { parseReads } from './parseDocument.js';

const OCR_LANGS = ['eng', 'hin'];
const OCR_LONG_SIDE = 2000;
const QR_MAX_SIDE = 3000;
const PDF_LONG_SIDE = 2400;
const MAX_FILES = 4;

export class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled');
    this.name = 'ScanCancelledError';
  }
}

function isScannable(file) {
  if (!file) return false;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) return true;
  return Boolean(file.type?.startsWith('image/')) && file.type !== 'image/svg+xml';
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new ScanCancelledError();
}

/** Resolves/rejects with `promise`, or rejects with ScanCancelledError as soon as `signal` aborts. */
function withAbort(promise, signal) {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ScanCancelledError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

// ---------------------------------------------------------------- OCR worker

let workerPromise = null;
let ocrLogger = null;

function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker(OCR_LANGS, 1 /* OEM.LSTM_ONLY */, {
        logger: (m) => ocrLogger?.(m),
      });
      return worker;
    })();
    // A failed download must not poison later attempts.
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

/** Terminates the worker behind `p`, and forgets it if it's still the shared one. */
function dropWorker(p) {
  if (!p) return;
  if (workerPromise === p) workerPromise = null;
  p.then((w) => w.terminate()).catch(() => { /* already gone */ });
}

/** Frees the OCR worker (~100 MB of wasm heap). Safe to call any time. */
export function releaseScanner() {
  dropWorker(workerPromise);
}

// ------------------------------------------------------------ image helpers

async function decodeImage(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      return await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function drawScaled(source, maxLongSide, { upscaleTo = 0 } = {}) {
  const w = source.width;
  const h = source.height;
  const long = Math.max(w, h);
  let scale = long > maxLongSide ? maxLongSide / long : 1;
  if (upscaleTo && long < upscaleTo) scale = Math.min(upscaleTo / long, 2.5);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * OCR-friendly copy: long side ~2000px, grayscale, contrast stretched so the
 * 2nd..98th luminance percentiles span the full range (evens out dim or
 * washed-out phone photos without blowing out text).
 */
function preprocessForOcr(source) {
  const canvas = drawScaled(source, OCR_LONG_SIDE, { upscaleTo: OCR_LONG_SIDE });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  const lum = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    lum[p] = y;
    hist[lum[p]] += 1;
  }
  const total = lum.length;
  let lo = 0;
  let hi = 255;
  for (let acc = 0, v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
  for (let acc = 0, v = 255; v >= 0; v -= 1) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
    const v = ((lum[p] - lo) * 255) / range;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function imageDataOf(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
}

// ------------------------------------------------------------------ QR codes

let zxingReady = null;

async function readQrTexts(canvas) {
  const zx = await import('zxing-wasm/reader');
  if (!zxingReady) {
    zx.prepareZXingModule({
      overrides: {
        locateFile: (path, prefix) => (path.endsWith('.wasm') ? zxingWasmUrl : prefix + path),
      },
    });
    zxingReady = true;
  }
  const results = await zx.readBarcodes(imageDataOf(canvas), {
    formats: ['QRCode'],
    tryHarder: true,
    maxNumberOfSymbols: 2,
  });
  return results.filter((r) => r.isValid && r.text).map((r) => r.text);
}

async function findAadhaarQr(canvases) {
  for (const c of canvases) {
    let texts = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      texts = await readQrTexts(c);
    } catch {
      texts = [];
    }
    for (const t of texts) {
      // eslint-disable-next-line no-await-in-loop
      const rec = await decodeAadhaarQr(t);
      if (rec) return rec;
    }
  }
  return null;
}

// ----------------------------------------------------------------------- OCR

async function ocrCanvas(canvas, signal, onWorker) {
  const workerP = getOcrWorker();
  onWorker?.(workerP);
  const worker = await withAbort(workerP, signal);
  const { data } = await withAbort(worker.recognize(canvas, {}, { text: true, blocks: true }), signal);
  const lines = [];
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const text = String(line.text || '').replace(/\s+/g, ' ').trim();
        if (text) lines.push({ text, confidence: line.confidence ?? 0 });
      }
    }
  }
  if (!lines.length && data.text) {
    return data.text.split(/\r?\n/).map((t) => t.trim()).filter(Boolean).map((text) => ({ text, confidence: data.confidence ?? 50 }));
  }
  return lines;
}

// ----------------------------------------------------------------------- PDF

/** Text-layer items -> lines, top to bottom, left to right. */
function textContentToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!('str' in it) || !it.str.trim()) continue;
    const y = it.transform[5];
    const x = it.transform[4];
    const h = Math.abs(it.transform[3]) || 10;
    let row = rows.find((r) => Math.abs(r.y - y) < h * 0.5);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text) => ({ text, confidence: 100 }));
}

/** Opens a PDF, or returns null for a password-protected one (e-Aadhaar) — those are skipped silently. */
async function openPdf(file, signal) {
  const pdfjs = await withAbort(loadPdfjs(), signal);
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await withAbort(pdfjs.getDocument({ data, isEvalSupported: false }).promise, signal);
  } catch (err) {
    if (err?.name === 'PasswordException') return null;
    throw err;
  }
}

// ---------------------------------------------------------------- pipeline

/**
 * Reads up to four queued images/PDFs and returns the parsed result.
 *
 * @param {File[]} files
 * @param {object} opts
 * @param {AbortSignal} [opts.signal]
 * @param {(p: {phase: 'preparing'|'reading', file: number, total: number, progress: number}) => void} [opts.onProgress]
 * @returns {Promise<{ parsed: object, lines: {text: string, confidence: number}[], skipped: string[], filesRead: number }>}
 */
export async function scanFiles(files, { signal, onProgress } = {}) {
  const list = files.filter(isScannable).slice(0, MAX_FILES);
  const reads = [];
  const qrRecords = [];
  const skipped = [];
  const total = list.length;
  let current = 0;
  let usedWorker = null;
  const onWorker = (p) => { usedWorker = p; };

  ocrLogger = (m) => {
    if (!onProgress) return;
    if (m.status === 'recognizing text') onProgress({ phase: 'reading', file: current, total, progress: m.progress || 0 });
    else if (/loading|initializ/i.test(m.status)) onProgress({ phase: 'preparing', file: current, total, progress: m.progress || 0 });
  };

  try {
    for (let i = 0; i < list.length; i += 1) {
      throwIfAborted(signal);
      current = i + 1;
      const file = list[i];
      onProgress?.({ phase: 'reading', file: current, total, progress: 0 });
      try {
        let lines = [];
        let qr = null;
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
          // eslint-disable-next-line no-await-in-loop
          const doc = await openPdf(file, signal);
          if (!doc) { skipped.push(file.name); continue; }
          try {
            // eslint-disable-next-line no-await-in-loop
            const page = await withAbort(doc.getPage(1), signal);
            // eslint-disable-next-line no-await-in-loop
            const text = await withAbort(page.getTextContent(), signal);
            const textLines = textContentToLines(text.items);
            const base = page.getViewport({ scale: 1 });
            const scale = PDF_LONG_SIDE / Math.max(base.width, base.height);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // eslint-disable-next-line no-await-in-loop
            await withAbort(page.render({ canvasContext: ctx, canvas, viewport }).promise, signal);
            // eslint-disable-next-line no-await-in-loop
            qr = await withAbort(findAadhaarQr([canvas]), signal);
            // Prefer the PDF's own text; OCR only scanned PDFs (little or no text layer).
            const alnum = textLines.map((l) => l.text).join('').replace(/[^A-Za-z0-9]/g, '').length;
            if (alnum >= 30) lines = textLines;
            // eslint-disable-next-line no-await-in-loop
            else if (!(qr?.number)) lines = await ocrCanvas(preprocessForOcr(canvas), signal, onWorker);
          } finally {
            // Frees pdf.js's worker-side copy (older builds expose destroy() on the document itself).
            if (typeof doc.destroy === 'function') doc.destroy();
            else doc.loadingTask?.destroy?.();
          }
        } else {
          let source;
          try {
            // eslint-disable-next-line no-await-in-loop
            source = await decodeImage(file);
          } catch {
            skipped.push(file.name); // e.g. HEIC in a browser that can't decode it
            continue;
          }
          const ocrCanvasCopy = preprocessForOcr(source);
          // QR first on a near-full-resolution copy (dense Aadhaar QRs need the pixels), then the cleaned copy.
          // eslint-disable-next-line no-await-in-loop
          qr = await withAbort(findAadhaarQr([drawScaled(source, QR_MAX_SIDE), ocrCanvasCopy]), signal);
          source.close?.();
          // An old XML QR already carries the full number — nothing left for OCR to add.
          // eslint-disable-next-line no-await-in-loop
          if (!(qr?.number)) lines = await ocrCanvas(ocrCanvasCopy, signal, onWorker);
        }
        if (qr) qrRecords.push(qr);
        reads.push({ lines });
      } catch (err) {
        if (err instanceof ScanCancelledError) throw err;
        // eslint-disable-next-line no-console
        console.warn('[scan] could not read', file.name, err);
        // Network failures while fetching the OCR engine are fatal for the whole scan.
        if (/fetch|network|load/i.test(String(err?.message || err)) && !reads.length) throw err;
        skipped.push(file.name);
      }
    }
  } catch (err) {
    if (err instanceof ScanCancelledError) {
      // Kill this scan's in-flight OCR job (never a newer scan's worker); the next scan starts a fresh one.
      dropWorker(usedWorker);
    }
    throw err;
  } finally {
    ocrLogger = null;
  }

  return { parsed: parseReads(reads, { qrRecords }), lines: reads.flatMap((r) => r.lines || []), skipped, filesRead: reads.length };
}
