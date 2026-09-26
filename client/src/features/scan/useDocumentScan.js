import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fileText, planScanFill } from './formFill.js';

const START_DELAY_MS = 400; // lets a multi-file pick / front+back photos settle into one scan

function isScannableFile(f) {
  if (!f) return false;
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')) return true;
  return Boolean(f.type?.startsWith('image/')) && f.type !== 'image/svg+xml';
}

/**
 * Silent, automatic reading of the photo/PDF on the "Add document" form.
 *
 * As soon as an image/PDF lands in the queue, the queued files are read in the browser
 * (`scanEngine.js`, loaded with a dynamic `import()` only then). `onFill({ title, notes, texts })`
 * is then called with:
 *  - for a known document (Aadhaar, PAN, passport, driving licence, voter ID, bank): a title like
 *    "Aadhaar Card – Ramesh Kumar" and plain "Label: value" lines for Notes;
 *  - `texts`: `{ [queue id]: text }` — the tidy text read from each file, saved with that file.
 * The form decides whether to use them (it never overwrites what the user typed). Nothing is
 * shown about what was or wasn't read, and every failure is console-only — the form always works
 * exactly as it does without the scanner.
 *
 * @param {object} args
 * @param {boolean} args.enabled
 * @param {{ id: string, file: File }[]} args.queue
 * @param {(plan: { title: string|null, notes: string, texts: Record<string, string> }) => void} args.onFill
 * @returns {{ scanning: boolean, cancel: () => void }}
 */
export function useDocumentScan({ enabled, queue, onFill }) {
  const { t } = useTranslation('scan');
  const [scanning, setScanning] = useState(false);

  const latest = useRef({});
  latest.current = { onFill, t };
  const abortRef = useRef(null);
  const engineRef = useRef(null);
  const scannedIds = useRef(new Set());

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
  }, []);

  const applyResult = useCallback((parsed, perFile, entries) => {
    const { onFill: fill, t: tr } = latest.current;
    const plan = planScanFill({
      parsed,
      typeLabel: parsed?.kind ? tr(`typeFallback.${parsed.kind}`) : '',
      labels: tr('noteLabels', { returnObjects: true }) || {},
    });
    const texts = {};
    for (const read of perFile || []) {
      const entry = entries.find((e) => e.file === read.file);
      const text = entry && fileText(read.lines);
      if (text) texts[entry.id] = text;
    }
    if (plan.title || plan.notes || Object.keys(texts).length) fill?.({ title: plan.title, notes: plan.notes, texts });
  }, []);

  const start = useCallback(async (entries) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    try {
      const engine = await import('./scanEngine.js');
      engineRef.current = engine;
      if (controller.signal.aborted) return;
      const { parsed, perFile } = await engine.scanFiles(entries.map((e) => e.file), { signal: controller.signal });
      if (!controller.signal.aborted) applyResult(parsed, perFile, entries);
    } catch (err) {
      if (!controller.signal.aborted && err?.name !== 'ScanCancelledError') {
        // eslint-disable-next-line no-console
        console.warn('[scan] auto-fill skipped', err);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setScanning(false);
      }
    }
  }, [applyResult]);

  // Auto-start whenever a new image/PDF joins the queue; re-read the whole
  // queue so e.g. Aadhaar front + back photos are merged.
  const scannable = enabled ? (queue || []).filter((q) => isScannableFile(q.file)) : [];
  const scanKey = scannable.map((q) => q.id).join('|');
  useEffect(() => {
    if (!enabled || !scanKey) return undefined;
    const ids = scanKey.split('|');
    if (!ids.some((id) => !scannedIds.current.has(id))) return undefined;
    const entries = scannable.map((q) => ({ id: q.id, file: q.file }));
    const timer = setTimeout(() => {
      ids.forEach((id) => scannedIds.current.add(id));
      start(entries);
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
    // `scannable` is derived from `queue` + `enabled`, both captured by scanKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scanKey, start]);

  // Disabled: forget what was scanned and free the OCR worker's memory; same on unmount.
  useEffect(() => {
    if (enabled) return;
    cancel();
    scannedIds.current = new Set();
    engineRef.current?.releaseScanner();
  }, [enabled, cancel]);
  useEffect(() => () => {
    abortRef.current?.abort();
    engineRef.current?.releaseScanner();
  }, []);

  return { scanning, cancel };
}
