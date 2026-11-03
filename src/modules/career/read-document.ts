import { ReadingError, validateReadingInput, suggestEntries } from './reading-rules';
import type { Worker } from 'tesseract.js';

/** Imported only on an explicit browser action. No document leaves the applicant's browser for OCR. */
export async function readDocument(bytes: Uint8Array, mime: string, progress: (message: string) => void) {
  validateReadingInput(bytes.byteLength, mime);
  let worker: Worker | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const pages: { page: number; text: string; ocr: boolean }[] = [];
  async function ocr(canvas: HTMLCanvasElement) {
    if (cancelled) throw new ReadingError('interrupted');
    if (!worker) {
      const [{ createWorker }, { default: workerPath }, { default: corePath }, { default: languageUrl }] = await Promise.all([
        import('tesseract.js'), import('tesseract.js/dist/worker.min.js?url'),
        import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
        import('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url'),
      ]);
      const language = await fetch(languageUrl);
      if (!language.ok) throw new ReadingError('interrupted');
      worker = await createWorker([{ code: 'eng', data: new Uint8Array(await language.arrayBuffer()) }], 1, {
        workerPath, corePath, cacheMethod: 'none', gzip: true,
        errorHandler: () => {}, logger: ({ status, progress: fraction }) => {
          if (status === 'recognizing text') progress(`Reading text… ${Math.round(fraction * 100)}%`);
        },
      });
      if (cancelled) { await worker.terminate(); throw new ReadingError('interrupted'); }
    }
    return (await worker.recognize(canvas)).data.text;
  }
  async function process() {
    if (mime === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      const { default: pdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
      const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true, stopAtErrors: true, verbosity: 0 });
      try {
        const pdf = await task.promise;
        if (pdf.numPages > 20) throw new ReadingError('limit');
        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled) throw new ReadingError('interrupted');
          progress(`Reading page ${n} of ${pdf.numPages}…`);
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          let text = ''; let lastY: number | undefined;
          for (const item of content.items) {
            if (!('str' in item)) continue;
            const y = item.transform[5];
            if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 3) text += '\n';
            text += item.str + (item.hasEOL ? '\n' : ' '); lastY = y;
          }
          let usedOCR = false;
          if (text.trim().length < 20) {
            usedOCR = true;
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(2, 2400 / Math.max(base.width, base.height));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            try {
              await page.render({ canvas, viewport }).promise;
              text = await ocr(canvas);
            } finally { canvas.width = 0; canvas.height = 0; }
          }
          pages.push({ page: n, text, ocr: usedOCR });
          if (pages.reduce((a, p) => a + p.text.length, 0) > 100000) throw new ReadingError('limit');
          page.cleanup();
        }
      } catch (error) {
        if (error instanceof ReadingError) throw error;
        if (error instanceof Error && error.name === 'PasswordException') throw new ReadingError('encrypted');
        throw new ReadingError('unreadable');
      } finally { await task.destroy(); }
    } else {
      const blob = new Blob([new Uint8Array(bytes)], { type: mime });
      const bitmap = await createImageBitmap(blob);
      try {
        if (bitmap.width * bitmap.height > 40000000) throw new ReadingError('limit');
        const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(bitmap.width * scale); canvas.height = Math.ceil(bitmap.height * scale);
        try {
          const context = canvas.getContext('2d');
          if (!context) throw new ReadingError('unreadable');
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          pages.push({ page: 1, text: await ocr(canvas), ocr: true });
        } finally { canvas.width = 0; canvas.height = 0; }
      } finally { bitmap.close(); }
    }
    const text = pages.map(p => `Page ${p.page}\n${p.text}`).join('\n\n');
    if (!pages.some(p => p.text.trim().length > 2)) throw new ReadingError('unreadable');
    return { text, suggestions: suggestEntries(pages), method: pages.every(p => p.ocr) ? 'ocr' : pages.some(p => p.ocr) ? 'mixed' : 'pdf_text' };
  }
  try {
    return await Promise.race([process(), new Promise<never>((_, reject) => {
      deadline = setTimeout(() => { cancelled = true; void worker?.terminate(); reject(new ReadingError('interrupted')); }, 5 * 60 * 1000);
    })]);
  } finally { cancelled = true; if (deadline) clearTimeout(deadline); await worker?.terminate(); }
}