import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crop, FileText } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import { KIND_ICON } from '@/components/ui/tokens.js';
import { loadPdfjs } from '../pdfjs.js';

const PDF_RENDER_WIDTH = 900; // px — sharp enough for the preview column, light on memory

/** The first page of a picked PDF, drawn onto a canvas (nothing when it can't be opened). */
function PdfFirstPage({ file, onFail }) {
  const canvasRef = useRef(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  useEffect(() => {
    let cancelled = false;
    let task = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const data = new Uint8Array(await file.arrayBuffer());
        task = pdfjs.getDocument({ data, isEvalSupported: false });
        const doc = await task.promise;
        if (cancelled) return;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: PDF_RENDER_WIDTH / base.width });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      } catch {
        if (!cancelled) failRef.current();
      }
    })();
    return () => {
      cancelled = true;
      task?.destroy?.();
    };
  }, [file]);
  return <canvas ref={canvasRef} className="mx-auto block max-h-[max(12rem,calc(100vh-42rem))] w-auto max-w-full rounded-md shadow-sm ring-1 ring-black/5" />;
}

/**
 * Large preview of one picked file on "Add document" (wide screens): the cropped photo, or the
 * first page of a PDF, with "Edit crop" under a photo.
 *
 * Props: entry (a useCropQueue entry, or null), onEditCrop(entry), disabled?
 */
export default function QueuedPreview({ entry, onEditCrop, disabled = false }) {
  const { t } = useTranslation('documents');
  const [pdfFailed, setPdfFailed] = useState(null); // the File that couldn't be drawn
  if (!entry) return null;
  const isPdf = entry.file.type === 'application/pdf' || /\.pdf$/i.test(entry.file.name || '');

  return (
    <figure className="rounded-xl bg-neutral-100 p-3 dark:bg-neutral-900">
      {entry.previewUrl ? (
        <img src={entry.previewUrl} alt={entry.file.name} className="mx-auto block max-h-[max(12rem,calc(100vh-42rem))] w-auto max-w-full rounded-md object-contain shadow-sm" />
      ) : isPdf && pdfFailed !== entry.file ? (
        <PdfFirstPage file={entry.file} onFail={() => setPdfFailed(entry.file)} />
      ) : (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <FileText className={`h-10 w-10 ${isPdf ? KIND_ICON.pdf : KIND_ICON.document}`} strokeWidth={1.5} aria-hidden="true" />
          {entry.file.name}
        </div>
      )}
      <figcaption className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-400">
          {entry.detecting ? t('crop.detecting', 'Finding the page edges…') : entry.file.name}
        </span>
        {entry.original && !entry.detecting && (
          <Button type="button" variant="secondary" size="sm" onClick={() => onEditCrop(entry)} disabled={disabled} leftIcon={<Crop className="h-4 w-4" aria-hidden="true" />}>
            {t('crop.edit', 'Edit crop')}
          </Button>
        )}
      </figcaption>
    </figure>
  );
}
