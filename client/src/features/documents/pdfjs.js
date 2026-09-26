import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

/**
 * pdf.js, loaded on first use only (it's large): the legacy build, so older phone browsers work
 * too, with its worker served from our own build output. Shared by the PDF viewer and the
 * document scanner so the library is only ever downloaded once.
 */
let pdfjsPromise = null;

export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return pdfjs;
    });
    // A failed download must not poison later attempts.
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}
