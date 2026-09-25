import { useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { Download, ImagePlus } from 'lucide-react';
import { DEFAULT_DPI, PRESETS, cmToPx, mmToPx, resolvePresetPx } from './presets.js';
import { compressToTarget, cropToCanvas, bytesToKB } from './canvasUtils.js';

const selectCls =
  'h-11 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100';

export function extFor(format) {
  return format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg';
}

/** File name without its extension (what the download box starts with). */
export function baseName(name) {
  return (name || '').replace(/\.[^./\\]+$/, '');
}

/**
 * ResizeEditor — the whole resize/compress flow for one picked image, entirely in the
 * browser (canvas + react-easy-crop): pick a preset (passport photo, signature, SSC/UPSC…)
 * or a custom size, drag/zoom the crop, see the result's size, then download it.
 * Nothing is uploaded or saved to the vault.
 *
 * Props: file (File, required), onChangeImage() — "Choose another image".
 */
export default function ResizeEditor({ file, onChangeImage }) {
  const { t } = useTranslation('resize');
  const [imageSrc, setImageSrc] = useState(null);
  const [presetKey, setPresetKey] = useState(PRESETS[0].key);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [custom, setCustom] = useState({ width: 400, height: 400, unit: 'px', dpi: DEFAULT_DPI, maxKB: '', format: 'jpeg', background: '#FFFFFF' });
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null); // { blob, width, height, quality }
  const [computing, setComputing] = useState(false);
  const [failed, setFailed] = useState(false);

  const preset = PRESETS.find((p) => p.key === presetKey) || PRESETS[0];
  const isCustom = preset.key === 'custom';

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setFileName(baseName(file.name) || t('defaultName', 'resized-image'));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setResult(null);
    setFailed(false);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const targetPx = useMemo(() => {
    if (isCustom) {
      const w = Number(custom.width) || 1;
      const h = Number(custom.height) || 1;
      if (custom.unit === 'px') return { widthPx: Math.round(w), heightPx: Math.round(h) };
      if (custom.unit === 'cm') return { widthPx: cmToPx(w, custom.dpi), heightPx: cmToPx(h, custom.dpi) };
      return { widthPx: mmToPx(w, custom.dpi), heightPx: mmToPx(h, custom.dpi) };
    }
    return resolvePresetPx(preset, { dpi: DEFAULT_DPI });
  }, [isCustom, custom, preset]);

  const aspect = targetPx.widthPx / targetPx.heightPx;
  const activeFormat = isCustom ? custom.format : preset.format;
  const activeMaxKB = isCustom ? (custom.maxKB ? Number(custom.maxKB) : null) : preset.maxKB;
  const activeBackground = isCustom ? custom.background : preset.background;

  const debouncedArea = useDebouncedValue(croppedAreaPixels, 250);
  const debouncedTarget = useDebouncedValue(targetPx, 250);

  useEffect(() => {
    if (!imageSrc || !debouncedArea) return undefined;
    let cancelled = false;
    setComputing(true);
    (async () => {
      try {
        const canvas = await cropToCanvas(imageSrc, debouncedArea, debouncedTarget.widthPx, debouncedTarget.heightPx, activeBackground);
        const out = await compressToTarget(canvas, { format: activeFormat, maxBytes: activeMaxKB ? activeMaxKB * 1024 : null });
        if (!cancelled) {
          setResult(out);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setResult(null);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setComputing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageSrc, debouncedArea, debouncedTarget.widthPx, debouncedTarget.heightPx, activeFormat, activeMaxKB, activeBackground]);

  const resultUrl = useMemo(() => (result?.blob ? URL.createObjectURL(result.blob) : null), [result]);
  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `${fileName.trim() || t('defaultName', 'resized-image')}.${extFor(activeFormat)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const setCustomField = (key) => (e) => setCustom((c) => ({ ...c, [key]: e.target.value }));

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-200">{t('step.size', '1. Pick a size')}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPresetKey(p.key)}
              aria-pressed={presetKey === p.key}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                presetKey === p.key
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
              }`}
            >
              <span className="block text-sm font-medium">{t(`presets.${p.key}.label`, p.label)}</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">{t(`presets.${p.key}.description`, p.description)}</span>
            </button>
          ))}
        </div>

        {isCustom && (
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-white p-3 sm:grid-cols-4 dark:border-neutral-700 dark:bg-neutral-800">
            <Input label={t('custom.width', 'Width')} type="number" min="1" value={custom.width} onChange={setCustomField('width')} />
            <Input label={t('custom.height', 'Height')} type="number" min="1" value={custom.height} onChange={setCustomField('height')} />
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('custom.unit', 'Unit')}</label>
              <select value={custom.unit} onChange={setCustomField('unit')} className={selectCls}>
                <option value="px">px</option>
                <option value="cm">cm</option>
                <option value="mm">mm</option>
              </select>
            </div>
            <Input
              label={t('custom.dpi', 'DPI')}
              type="number"
              min="72"
              value={custom.dpi}
              onChange={(e) => setCustom((c) => ({ ...c, dpi: Number(e.target.value) || DEFAULT_DPI }))}
              disabled={custom.unit === 'px'}
            />
            <Input label={t('custom.maxSize', 'Max size (KB)')} type="number" min="1" value={custom.maxKB} onChange={setCustomField('maxKB')} placeholder={t('custom.noLimit', 'No limit')} />
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('custom.format', 'Format')}</label>
              <select value={custom.format} onChange={setCustomField('format')} className={selectCls}>
                <option value="jpeg">JPG</option>
                <option value="png">PNG</option>
                <option value="webp">WEBP</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">{t('custom.background', 'Background')}</label>
              <input type="color" value={custom.background} onChange={setCustomField('background')} className="h-11 w-full rounded-lg border border-neutral-200 dark:border-neutral-700" />
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-200">{t('step.crop', '2. Move and zoom to fit')}</h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div className="relative h-[300px] overflow-hidden rounded-xl bg-neutral-900 sm:h-[400px]">
              {imageSrc && (
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_area, areaPixels) => setCroppedAreaPixels(areaPixels)}
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="resize-zoom" className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                {t('zoom', 'Zoom')}
              </label>
              <input id="resize-zoom" type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-primary-500" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{t('preview', 'Result')}</p>
              {computing && !result ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="sm" />
                </div>
              ) : result ? (
                <>
                  <img src={resultUrl} alt={t('preview', 'Result')} className="mx-auto max-h-40 rounded border border-neutral-100 dark:border-neutral-700" />
                  <p className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-300">
                    {result.width}×{result.height}px · <span className="font-semibold">{bytesToKB(result.blob.size)} KB</span>
                  </p>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  {failed ? t('processFailed', 'Could not process this image. Try another one.') : t('adjustHint', 'Adjust the crop to see the result')}
                </p>
              )}
            </div>

            <Input label={t('fileName', 'File name')} value={fileName} onChange={(e) => setFileName(e.target.value)} />

            <Button block onClick={handleDownload} disabled={!result || computing} leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}>
              {t('download', 'Download')}
            </Button>
            <Button block variant="secondary" onClick={onChangeImage} leftIcon={<ImagePlus className="h-4 w-4" aria-hidden="true" />}>
              {t('changeImage', 'Choose another image')}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
