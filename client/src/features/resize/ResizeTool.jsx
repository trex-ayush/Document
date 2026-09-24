import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { useAddFiles } from '@/features/documents/documentsHooks.js';
import { DEFAULT_DPI, PRESETS, cmToPx, mmToPx, resolvePresetPx } from './presets.js';
import { compressToTarget, cropToCanvas, bytesToKB } from './canvasUtils.js';

/**
 * Image resize/compress tool (`features/resize/**`) — entirely client-side
 * via `<canvas>`, `react-easy-crop` for the crop rectangle. Two entry
 * points, per this agent's build plan ("your call on exact entry points,
 * document them"):
 *  - Document viewer's per-file "…" menu (`FilePreview.jsx`) — `mode="attach"`,
 *    saves the result as a NEW labelled file on the same document via
 *    `POST /documents/:id/files` (original file untouched either way).
 *  - Upload flow, per queued file before it's uploaded (`UploadModal.jsx`) —
 *    `mode="standalone"`, hands the processed `File` back to the caller via
 *    `onResult`, replacing that queue entry; nothing is uploaded by the tool
 *    itself in this mode.
 * Both modes also offer a plain "Download" action.
 */
export default function ResizeTool({ isOpen, onClose, file, documentId, mode = 'download', onResult, onSaved }) {
  const { t } = useTranslation(['documents', 'common']);
  const [imageSrc, setImageSrc] = useState(null);
  const [presetKey, setPresetKey] = useState(PRESETS[0].key);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const [custom, setCustom] = useState({ width: 400, height: 400, unit: 'px', dpi: DEFAULT_DPI, maxKB: '', format: 'jpeg', background: '#FFFFFF' });
  const [labelInput, setLabelInput] = useState('');

  const [result, setResult] = useState(null); // { blob, width, height, quality }
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const addFiles = useAddFiles(documentId);
  const objectUrlRef = useRef(null);

  const preset = PRESETS.find((p) => p.key === presetKey) || PRESETS[0];
  const isCustom = preset.key === 'custom';

  useEffect(() => {
    if (!isOpen || !file) return undefined;
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setImageSrc(url);
    setLabelInput((file.name || t('resize.defaultLabel', 'Resized image')).replace(/\.[^./\\]+$/, ''));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPresetKey(PRESETS[0].key);
    setResult(null);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [isOpen, file]);

  const targetPx = useMemo(() => {
    if (isCustom) {
      const unit = custom.unit;
      const w = Number(custom.width) || 1;
      const h = Number(custom.height) || 1;
      if (unit === 'px') return { widthPx: Math.round(w), heightPx: Math.round(h) };
      if (unit === 'cm') return { widthPx: cmToPx(w, custom.dpi), heightPx: cmToPx(h, custom.dpi) };
      return { widthPx: mmToPx(w, custom.dpi), heightPx: mmToPx(h, custom.dpi) };
    }
    return resolvePresetPx(preset, { dpi: DEFAULT_DPI });
  }, [isCustom, custom, preset]);

  const aspect = targetPx.widthPx / targetPx.heightPx;

  const activeFormat = isCustom ? custom.format : preset.format;
  const activeMaxKB = isCustom ? (custom.maxKB ? Number(custom.maxKB) : null) : preset.maxKB;
  const activeBackground = isCustom ? custom.background : preset.background;

  const onCropComplete = (_area, areaPixels) => setCroppedAreaPixels(areaPixels);

  const debouncedArea = useDebouncedValue(croppedAreaPixels, 250);
  const debouncedTarget = useDebouncedValue(targetPx, 250);

  useEffect(() => {
    if (!imageSrc || !debouncedArea) return;
    let cancelled = false;
    setComputing(true);
    (async () => {
      try {
        const canvas = await cropToCanvas(imageSrc, debouncedArea, debouncedTarget.widthPx, debouncedTarget.heightPx, activeBackground);
        const maxBytes = activeMaxKB ? activeMaxKB * 1024 : null;
        const out = await compressToTarget(canvas, { format: activeFormat, maxBytes });
        if (!cancelled) setResult(out);
      } catch {
        if (!cancelled) toast.error(t('resize.toasts.processFailed', 'Could not process this image'));
      } finally {
        if (!cancelled) setComputing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, debouncedArea, debouncedTarget.widthPx, debouncedTarget.heightPx, activeFormat, activeMaxKB, activeBackground]);

  const resultUrl = useMemo(() => (result?.blob ? URL.createObjectURL(result.blob) : null), [result]);
  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const extFor = (format) => (format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg');

  const handleDownload = () => {
    if (!result?.blob) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `${labelInput || 'resized'}.${extFor(activeFormat)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const buildResultFile = () =>
    new File([result.blob], `${labelInput || 'resized'}.${extFor(activeFormat)}`, {
      type: result.blob.type,
      lastModified: Date.now(),
    });

  const handleUseResult = () => {
    if (!result?.blob) return;
    onResult?.(buildResultFile(), labelInput);
    onClose();
  };

  const handleSaveToDocument = async () => {
    if (!result?.blob || !documentId) return;
    setSaving(true);
    try {
      await addFiles.mutateAsync({ payload: { files: [buildResultFile()], labels: [labelInput || t('resize.defaultLabelShort', 'Resized')] } });
      toast.success(t('resize.toasts.savedAsNewFile', 'Saved as a new file'));
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('resize.toasts.saveFailed', 'Could not save the file'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('resize.title', 'Resize / compress image')} size="xl">
      {!imageSrc ? null : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPresetKey(p.key)}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${
                  presetKey === p.key
                    ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                    : 'border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300'
                }`}
              >
                <span className="block font-medium">{t(`resize.presets.${p.key}.label`, p.label)}</span>
                <span className="block text-neutral-400">{t(`resize.presets.${p.key}.description`, p.description)}</span>
              </button>
            ))}
          </div>

          {isCustom && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700 sm:grid-cols-4">
              <Input label={t('resize.widthLabel', 'Width')} type="number" min="1" value={custom.width} onChange={(e) => setCustom((c) => ({ ...c, width: e.target.value }))} />
              <Input label={t('resize.heightLabel', 'Height')} type="number" min="1" value={custom.height} onChange={(e) => setCustom((c) => ({ ...c, height: e.target.value }))} />
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('resize.unitLabel', 'Unit')}</label>
                <select value={custom.unit} onChange={(e) => setCustom((c) => ({ ...c, unit: e.target.value }))} className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
                  <option value="px">px</option>
                  <option value="cm">cm</option>
                  <option value="mm">mm</option>
                </select>
              </div>
              <Input label={t('resize.dpiLabel', 'DPI')} type="number" min="72" value={custom.dpi} onChange={(e) => setCustom((c) => ({ ...c, dpi: Number(e.target.value) || DEFAULT_DPI }))} disabled={custom.unit === 'px'} />
              <Input label={t('resize.maxSizeLabel', 'Max size (KB)')} type="number" min="1" value={custom.maxKB} onChange={(e) => setCustom((c) => ({ ...c, maxKB: e.target.value }))} placeholder={t('resize.noLimit', 'No limit')} />
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('resize.formatLabel', 'Format')}</label>
                <select value={custom.format} onChange={(e) => setCustom((c) => ({ ...c, format: e.target.value }))} className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
                  <option value="jpeg">JPG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WEBP</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('resize.backgroundLabel', 'Background')}</label>
                <input type="color" value={custom.background} onChange={(e) => setCustom((c) => ({ ...c, background: e.target.value }))} className="h-11 w-full rounded-lg border border-neutral-200 dark:border-neutral-700" />
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
            <div className="relative h-[280px] overflow-hidden rounded-xl bg-neutral-900 sm:h-[380px]">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">{t('resize.zoomLabel', 'Zoom')}</label>
                <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
              </div>

              <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{t('resize.resultPreviewLabel', 'Result preview')}</p>
                {computing ? (
                  <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
                ) : result ? (
                  <>
                    <img src={resultUrl} alt={t('resize.resultPreviewLabel', 'Result preview')} className="mx-auto max-h-32 rounded border border-neutral-100 dark:border-neutral-700" />
                    <p className="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
                      {result.width}×{result.height}px · {bytesToKB(result.blob.size)} KB
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-neutral-400">{t('resize.adjustCropHint', 'Adjust the crop to preview')}</p>
                )}
              </div>

              <Input label={t('resize.labelInputLabel', 'Label')} value={labelInput} onChange={(e) => setLabelInput(e.target.value)} />

              <div className="flex flex-col gap-2">
                <Button variant="secondary" onClick={handleDownload} disabled={!result}>{t('common:actions.download', 'Download')}</Button>
                {mode === 'attach' && documentId && (
                  <Button onClick={handleSaveToDocument} loading={saving} disabled={!result}>{t('resize.saveAsNewFile', 'Save as new file')}</Button>
                )}
                {mode === 'standalone' && (
                  <Button onClick={handleUseResult} disabled={!result}>{t('resize.useThisImage', 'Use this image')}</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
