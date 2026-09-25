import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { kindFromTypeName, findTypeForKind } from './typeKinds.js';
import { planFill, applyFieldValues } from './formFill.js';

const START_DELAY_MS = 400; // lets a multi-file pick / front+back photos settle into one scan

function isScannableFile(f) {
  if (!f) return false;
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')) return true;
  return Boolean(f.type?.startsWith('image/')) && f.type !== 'image/svg+xml';
}

/**
 * Silent, automatic "scan to auto-fill" for the upload form.
 *
 * As soon as an image/PDF lands in the upload queue, the queued files are read
 * in the browser (`scanEngine.js`, loaded with a dynamic `import()` only then)
 * and whatever is read CONFIDENTLY is filled in: document type (only if none
 * is picked), title, template field values and the expiry date. Nothing is
 * shown about what was or wasn't filled, and every failure is console-only —
 * the form always works exactly as it does without the scanner.
 *
 * Never overwrites the user: every fill re-checks emptiness inside a
 * functional state update, so anything typed/chosen while the scan ran wins.
 *
 * @param {object} args
 * @param {boolean} args.enabled    modal open in create mode
 * @param {{ id: string, file: File }[]} args.queue
 * @param {object[]} args.types     DocumentType list (`typesData.items`)
 * @param {{ title, typeId, expiryDate, customFields }} args.form
 * @param {{ setTitle, setExpiryDate, setCustomFields, onTypeChange }} args.actions
 *   `onTypeChange` is the form's own type handler (adds the template's fields).
 * @returns {{ scanning: boolean, cancel: () => void }}
 */
export function useDocumentScan({ enabled, queue, types, form, actions }) {
  const { t } = useTranslation('scan');
  const [scanning, setScanning] = useState(false);

  const latest = useRef({});
  latest.current = { form, types: types || [], actions, t };
  const abortRef = useRef(null);
  const engineRef = useRef(null);
  const scannedIds = useRef(new Set());

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setScanning(false);
  }, []);

  const applyResult = useCallback((parsed) => {
    const { form: f, types: tl, actions: a, t: tr } = latest.current;
    if (!parsed?.kind) return;
    const chosen = tl.find((x) => x.id === f.typeId) || null;
    const chosenKind = chosen ? kindFromTypeName(chosen.name) : null;
    // The user picked a different kind of document meanwhile — don't pour e.g. PAN values into it.
    if (chosenKind && chosenKind !== parsed.kind) return;
    const autoType = f.typeId ? null : findTypeForKind(tl, parsed.kind);
    const typeLabel = (chosenKind ? chosen : autoType)?.name || tr(`typeFallback.${parsed.kind}`);

    const plan = planFill({
      parsed,
      customFields: f.customFields || [],
      templateFields: autoType?.fields || [],
      form: f,
      typeLabel,
    });

    if (autoType) a.onTypeChange(autoType.id);
    if (Object.keys(plan.fields).length) a.setCustomFields((prev) => applyFieldValues(prev, plan.fields));
    if (plan.title) a.setTitle((prev) => (String(prev || '').trim() ? prev : plan.title));
    if (plan.expiryDate) a.setExpiryDate((prev) => prev || plan.expiryDate);
  }, []);

  const start = useCallback(async (files) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    try {
      const engine = await import('./scanEngine.js');
      engineRef.current = engine;
      if (controller.signal.aborted) return;
      const { form: f, types: tl } = latest.current;
      const chosen = tl.find((x) => x.id === f.typeId);
      const { parsed } = await engine.scanFiles(files, {
        signal: controller.signal,
        forcedKind: chosen ? kindFromTypeName(chosen.name) : null,
      });
      if (!controller.signal.aborted) applyResult(parsed);
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
    const files = scannable.map((q) => q.file);
    const timer = setTimeout(() => {
      ids.forEach((id) => scannedIds.current.add(id));
      start(files);
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
    // `scannable` is derived from `queue` + `enabled`, both captured by scanKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scanKey, start]);

  // New modal session: forget what was scanned; on close free the OCR worker's memory.
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
