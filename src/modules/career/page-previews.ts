/** Small private page images rendered in this browser only; nothing is uploaded or saved. */
export async function renderPageThumbnails(bytes: Uint8Array, mime: string, onPage: (page: number, url: string) => void, skip: (page: number) => boolean = () => false) {
  if (mime !== 'application/pdf') return;
  const pdfjs = await import('pdfjs-dist');
  const { default: pdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  try {
    const pdf = await task.promise;
    for (let n = 1; n <= Math.min(pdf.numPages, 20); n++) {
      if (skip(n)) continue;
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 240 / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try { await page.render({ canvas, viewport }).promise; onPage(n, canvas.toDataURL('image/jpeg', .7)); }
      finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
    }
  } finally { await task.destroy(); }
}
