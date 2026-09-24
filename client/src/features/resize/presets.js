/**
 * Resize/compress presets (product brief). Dimensions are in mm unless
 * `unit: 'px'` (the two SSC/UPSC presets are specified directly in pixels,
 * not physical size — no DPI conversion for those).
 *
 * `maxKB`/`minKB` drive the binary-search-quality compressor in
 * `canvasUtils.js`; `minKB` is a soft floor (used to avoid over-compressing
 * once already under budget), `maxKB` is the hard ceiling we binary-search
 * toward. Where the brief gave only an upper bound ("under 50 KB"), `minKB`
 * is left unset.
 */
export const DEFAULT_DPI = 200;

export const PRESETS = [
  {
    key: 'passport',
    label: 'Passport photo',
    description: '3.5 × 4.5 cm, under 50 KB',
    unit: 'mm',
    widthMm: 35,
    heightMm: 45,
    maxKB: 50,
    format: 'jpeg',
  },
  {
    key: 'stamp',
    label: 'Stamp photo',
    description: '2.5 × 3 cm',
    unit: 'mm',
    widthMm: 25,
    heightMm: 30,
    maxKB: 30,
    format: 'jpeg',
  },
  {
    key: 'signature',
    label: 'Signature',
    description: '3.5 × 1.5 cm, 10–20 KB',
    unit: 'mm',
    widthMm: 35,
    heightMm: 15,
    minKB: 10,
    maxKB: 20,
    format: 'jpeg',
    background: '#FFFFFF',
  },
  {
    key: 'ssc-photo',
    label: 'SSC/UPSC photo',
    description: '200 × 230 px, 20–50 KB',
    unit: 'px',
    widthPx: 200,
    heightPx: 230,
    minKB: 20,
    maxKB: 50,
    format: 'jpeg',
  },
  {
    key: 'ssc-signature',
    label: 'SSC/UPSC signature',
    description: '140 × 60 px, 10–20 KB',
    unit: 'px',
    widthPx: 140,
    heightPx: 60,
    minKB: 10,
    maxKB: 20,
    format: 'jpeg',
    background: '#FFFFFF',
  },
  {
    key: 'custom',
    label: 'Custom',
    description: 'Set your own size, DPI, format and target file size',
    unit: 'px',
    widthPx: 400,
    heightPx: 400,
    format: 'jpeg',
  },
];

/** mm -> device px at the given DPI (1 inch = 25.4mm). */
export function mmToPx(mm, dpi = DEFAULT_DPI) {
  return Math.round((mm / 25.4) * dpi);
}

/** cm -> device px at the given DPI. */
export function cmToPx(cm, dpi = DEFAULT_DPI) {
  return mmToPx(cm * 10, dpi);
}

/** Resolves a preset (+ live custom overrides) to concrete `{widthPx, heightPx}`. */
export function resolvePresetPx(preset, { dpi = DEFAULT_DPI } = {}) {
  if (preset.unit === 'px') return { widthPx: preset.widthPx, heightPx: preset.heightPx };
  return { widthPx: mmToPx(preset.widthMm, dpi), heightPx: mmToPx(preset.heightMm, dpi) };
}
