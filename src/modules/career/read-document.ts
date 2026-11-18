import { ReadingError, validateReadingInput, suggestEntries } from './reading-rules';
import { privatePageText } from './structured-reading';
import { usablePdfText, withPageDeadline, readingSummary } from './reading-session';
import type { PageOutcome, ReadingProgress } from './reading-session';
import type { Worker } from 'tesseract.js';

type Page = { page: number; text: string; ocr: boolean; confidence?: number };
/** Loaded only by an explicit applicant action. OCR stays in this browser. */
export async function readDocument(bytes: Uint8Array, mime: string, progress: (message: string) => void,
  options: { signal?: AbortSignal; onProgress?: (value: ReadingProgress) => void } = {}) {
  validateReadingInput(bytes.byteLength, mime);
  let worker: Worker | undefined;
  let total = 1;
  let current = 0;
  let active = true;
  let generation = 0;
  const pages: Page[] = [];
  const outcomes: PageOutcome[] = [];
  function report(phase: ReadingProgress['phase'], message: string, fraction = 0) {
    if (!active) return;
    progress(message);
    options.onProgress?.({ page: current, total, completed: outcomes.length,
      percent: Math.min(99, Math.round((outcomes.length + fraction) / total * 100)), phase, message });
  }
  function terminate() {
    generation++;
    const old = worker; worker = undefined;
    void old?.terminate().catch(() => {});
  }
  async function ocr(canvas: HTMLCanvasElement) {
    if (!worker) {
      const startedGeneration = generation;
      report('ocr', `Preparing scan reader · page ${current} of ${total}…`);
      const [tesseract, { default: workerPath }, { default: corePath }] = await Promise.all([
        import('tesseract.js'), import('tesseract.js/dist/worker.min.js?url'),
        import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
      ]);
      const created = await tesseract.default.createWorker('eng', 1, {
        workerPath, corePath, langPath: new URL('/ocr', window.location.origin).href,
        cacheMethod: 'none', gzip: true, errorHandler: () => {},
        logger: ({ status, progress: fraction }) => {
          if (status === 'recognizing text') report('ocr', `Reading scan · page ${current} of ${total} · ${Math.round(fraction * 100)}%`, fraction * .9);
        },
      });
      if (!active || options.signal?.aborted || generation !== startedGeneration) { await created.terminate(); throw new ReadingError('interrupted'); }
      worker = created;
    }
    const reader = worker;
    let best = (await reader.recognize(canvas, { rotateAuto: true })).data;
    // Try alternate orientations only for unclear scans, with no repeated crops.
    if (best.confidence < 65) {
      const rotated = document.createElement('canvas');
      try {
        for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
          if (options.signal?.aborted || worker !== reader) throw new ReadingError('interrupted');
          report('ocr', `Checking scan orientation · page ${current} of ${total}…`);
          rotated.width = angle === Math.PI ? canvas.width : canvas.height;
          rotated.height = angle === Math.PI ? canvas.height : canvas.width;
          const ctx = rotated.getContext('2d');
          if (!ctx) throw new ReadingError('unreadable');
          ctx.translate(rotated.width / 2, rotated.height / 2); ctx.rotate(angle);
          ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
          const candidate = (await reader.recognize(rotated)).data;
          if (candidate.confidence > best.confidence) best = candidate;
          if (best.confidence >= 65) break;
        }
      } finally { rotated.width = 0; rotated.height = 0; }
    }
    return { text: best.text, confidence: best.confidence };
  }
  function record(page: Page) {
    const reliable = page.text.trim().length > 2 && (page.confidence === undefined || page.confidence >= 45);
    pages.push(page);
    outcomes.push({ page: page.page, status: reliable ? 'read' : 'uncertain' });
    if (pages.reduce((sum, p) => sum + p.text.length, 0) > 100000) throw new ReadingError('limit');
    report('text', `${outcomes.length} of ${total} pages processed`);
  }
  try {
    report('opening', 'Opening private document…');
    if (mime === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      const { default: pdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
      const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true, stopAtErrors: true, verbosity: 0 });
      try {
        const pdf = await task.promise; total = pdf.numPages;
        if (total > 20) throw new ReadingError('limit');
        for (let n = 1; n <= total; n++) {
          if (options.signal?.aborted) break;
          current = n;
          report('text', `Reading page ${n} of ${total}…`);
          let abandon = false;
          let render: { cancel: () => void } | undefined;
          try {
            const result = await withPageDeadline(async () => {
              const page = await pdf.getPage(n);
              try {
                const content = await page.getTextContent();
                let text = ''; let lastY: number | undefined;
                for (const item of content.items) {
                  if (!('str' in item)) continue;
                  const y = item.transform[5];
                  if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 3) text += '\n';
                  text += item.str + (item.hasEOL ? '\n' : ' '); lastY = y;
                }
                if (usablePdfText(text)) return { page: n, text, ocr: false };
                if (abandon) throw new ReadingError('interrupted');
                const base = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(base.width, base.height)) });
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                try {
                  const rendering = page.render({ canvas, viewport }); render = rendering;
                  await rendering.promise;
                  if (abandon) throw new ReadingError('interrupted');
                  return { page: n, ...await ocr(canvas), ocr: true };
                } finally { canvas.width = 0; canvas.height = 0; }
              } finally { page.cleanup(); }
            }, () => { abandon = true; render?.cancel(); terminate(); }, options.signal);
            record(result);
          } catch (error) {
            if (error instanceof ReadingError && error.code === 'limit') throw error;
            if (options.signal?.aborted) break;
            outcomes.push({ page: n, status: 'skipped' });
            report('text', `Page ${n} needs manual review · continuing…`);
          }
        }
      } catch (error) {
        if (error instanceof ReadingError) throw error;
        if (error instanceof Error && error.name === 'PasswordException') throw new ReadingError('encrypted');
        throw new ReadingError('unreadable');
      } finally { await task.destroy(); }
    } else {
      current = 1;
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mime }));
      try {
        if (bitmap.width * bitmap.height > 40000000) throw new ReadingError('limit');
        const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(bitmap.width * scale); canvas.height = Math.ceil(bitmap.height * scale);
        try {
          const ctx = canvas.getContext('2d'); if (!ctx) throw new ReadingError('unreadable');
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          record({ page: 1, ...await withPageDeadline(() => ocr(canvas), terminate, options.signal), ocr: true });
        } finally { canvas.width = 0; canvas.height = 0; }
      } finally { bitmap.close(); }
    }
    if (!pages.some(p => p.text.trim().length > 2)) throw new ReadingError(options.signal?.aborted ? 'interrupted' : 'unreadable');
    const summary = readingSummary(outcomes, total, options.signal?.aborted === true);
    const reliable = pages.filter(p => outcomes.some(o => o.page === p.page && o.status === 'read'));
    const text = `${summary}\n\n${pages.map(privatePageText).join('\n\n')}`;
    if (text.length > 100000) throw new ReadingError('limit');
    report('saving', 'Saving private results for review…');
    return { text, suggestions: suggestEntries(reliable), pages, outcomes, summary,
      partial: outcomes.some(p => p.status !== 'read') || outcomes.length < total,
      method: pages.every(p => p.ocr) ? 'ocr' : pages.some(p => p.ocr) ? 'mixed' : 'pdf_text' };
  } finally { active = false; terminate(); }
}
