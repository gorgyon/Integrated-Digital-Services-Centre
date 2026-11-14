import { ReadingError, validateReadingInput, suggestEntries } from './reading-rules';
import { privatePageText } from './structured-reading';
import type { Worker } from 'tesseract.js';

/** Imported only on an explicit browser action. No document leaves the applicant's browser for OCR. */
export async function readDocument(bytes: Uint8Array, mime: string, progress: (message: string) => void) {
  validateReadingInput(bytes.byteLength, mime);
  let worker: Worker | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
   const pages: { page: number; text: string; ocr: boolean; confidence?: number }[] = [];
  async function ocr(canvas: HTMLCanvasElement) {
    if (cancelled) throw new ReadingError('interrupted');
    if (!worker) {
      const [tesseract, { default: workerPath }, { default: corePath }] = await Promise.all([
        import('tesseract.js'), import('tesseract.js/dist/worker.min.js?url'),
        import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
      ]);
      worker = await tesseract.default.createWorker('eng', 1, {
        workerPath, corePath, langPath: new URL('/ocr', window.location.origin).href, cacheMethod: 'none', gzip: true,
        errorHandler: () => {}, logger: ({ status, progress: fraction }) => {
          if (status === 'recognizing text') progress(`Reading text… ${Math.round(fraction * 100)}%`);
        },
      });
      if (cancelled) { await worker.terminate(); throw new ReadingError('interrupted'); }
    }
    const score = (text: string, confidence: number) => confidence + 20 * (text.match(/\b(?:transcript|development|information|semester|technology|national|diploma|certificate)\b/gi)?.length ?? 0);
    let best = (await worker.recognize(canvas, { rotateAuto: true })).data;
    let bestAngle = 0;
    // Sideways scans can contain a long but unusable pre-existing OCR layer.
    if (best.confidence < 65) {
      const rotated = document.createElement('canvas');
      try {
        for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
          rotated.width = angle === Math.PI ? canvas.width : canvas.height;
          rotated.height = angle === Math.PI ? canvas.height : canvas.width;
          const context = rotated.getContext('2d');
          if (!context) throw new ReadingError('unreadable');
          context.translate(rotated.width / 2, rotated.height / 2); context.rotate(angle);
          context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
          let candidate = (await worker.recognize(rotated)).data;
          const focusedCanvas = document.createElement('canvas');
          try {
            focusedCanvas.width = Math.round(rotated.width * .62); focusedCanvas.height = rotated.height;
            focusedCanvas.getContext('2d')?.drawImage(rotated, 0, 0);
            const focused = (await worker.recognize(focusedCanvas)).data;
            if (score(focused.text, focused.confidence) > score(candidate.text, candidate.confidence)) candidate = focused;
          } finally { focusedCanvas.width = 0; focusedCanvas.height = 0; }
          if (score(candidate.text, candidate.confidence) > score(best.text, best.confidence)) { best = candidate; bestAngle = angle; }
        }
      } finally { rotated.width = 0; rotated.height = 0; }
    }
    if (/transcript|semester/i.test(best.text)) {
      const upright = document.createElement('canvas');
      const crop = document.createElement('canvas');
      try {
        upright.width = Math.abs(bestAngle) === Math.PI / 2 ? canvas.height : canvas.width;
        upright.height = Math.abs(bestAngle) === Math.PI / 2 ? canvas.width : canvas.height;
        const ctx = upright.getContext('2d');
        if (ctx) {
          ctx.translate(upright.width / 2, upright.height / 2); ctx.rotate(bestAngle);
          ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
          crop.width = Math.round(upright.width * .62); crop.height = upright.height;
          crop.getContext('2d')?.drawImage(upright, 0, 0);
          const focused = (await worker.recognize(crop)).data;
          if (score(focused.text, focused.confidence) > score(best.text, best.confidence)) best = focused;
        }
      } finally { upright.width = 0; upright.height = 0; crop.width = 0; crop.height = 0; }
    }
    return { text: best.text, confidence: best.confidence };
  }
  async function process() {
    if (mime === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      const { default: pdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
      const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true, stopAtErrors: true, verbosity: 0 });
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
          let usedOCR = false; let confidence: number | undefined;
          const operators = await page.getOperatorList();
          const scanned = operators.fnArray.some(op => op === pdfjs.OPS.paintImageXObject || op === pdfjs.OPS.paintInlineImageXObject);
          if (text.trim().length < 20 || scanned) {
            usedOCR = true;
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(2, 2400 / Math.max(base.width, base.height));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            try {
              await page.render({ canvas, viewport }).promise;
              const result = await ocr(canvas); text = result.text; confidence = result.confidence;
            } finally { canvas.width = 0; canvas.height = 0; }
          }
          pages.push({ page: n, text, ocr: usedOCR, confidence });
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
          pages.push({ page: 1, ...await ocr(canvas), ocr: true });
        } finally { canvas.width = 0; canvas.height = 0; }
      } finally { bitmap.close(); }
    }
    const text = pages.map(privatePageText).join('\n\n');
    if (!pages.some(p => p.text.trim().length > 2)) throw new ReadingError('unreadable');
    return { text, suggestions: suggestEntries(pages), pages, method: pages.every(p => p.ocr) ? 'ocr' : pages.some(p => p.ocr) ? 'mixed' : 'pdf_text' };
  }
  try {
    return await Promise.race([process(), new Promise<never>((_, reject) => {
      deadline = setTimeout(() => { cancelled = true; void worker?.terminate(); reject(new ReadingError('interrupted')); }, 5 * 60 * 1000);
    })]);
  } finally { cancelled = true; if (deadline) clearTimeout(deadline); await worker?.terminate(); }
}