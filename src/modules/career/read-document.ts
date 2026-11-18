import { ReadingError, validateReadingInput, suggestEntries } from './reading-rules';
import { privatePageText, classifyPage } from './structured-reading';
import { usablePdfText, withPageDeadline, readingSummary, realWords } from './reading-session';
import type { PageOutcome, ReadingProgress } from './reading-session';
import type { Worker } from 'tesseract.js';

type Page = { page: number; text: string; ocr: boolean; confidence?: number; rotated?: boolean; angle?: number; layoutText?: string };
/** Designed CVs: light text on dark panels is flipped to dark-on-light and pale grey text darkened, so OCR sees contact details and dates. */
function layoutEnhance(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
  const w = canvas.width, h = canvas.height, B = 24;
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  const grey = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) grey[i] = (d[i * 4]! * 299 + d[i * 4 + 1]! * 587 + d[i * 4 + 2]! * 114) / 1000;
  // Average brightness of 24px blocks, softened over neighbouring blocks: tells dark panels from dark text.
  const bw = Math.ceil(w / B), bh = Math.ceil(h / B); const sum = new Float64Array(bw * bh); const cnt = new Uint32Array(bw * bh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y / B | 0) * bw + (x / B | 0); sum[k]! += grey[y * w + x]!; cnt[k]!++; }
  const mean = new Float64Array(bw * bh); for (let k = 0; k < mean.length; k++) mean[k] = sum[k]! / Math.max(1, cnt[k]!);
  const dark = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let t = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = by + dy, xx = bx + dx; if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) { t += mean[yy * bw + xx]!; n++; } }
    dark[by * bw + bx] = t / n < 110 ? 1 : 0;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = grey[i]!;
    if (dark[(y / B | 0) * bw + (x / B | 0)]) v = 255 - v;
    v = v >= 225 ? 255 : v * .45;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}
/** Greyscale and contrast stretch so faint scans are easier to read. */
function enhance(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height); const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const y = (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000 | 0; d[i] = y; hist[y]!++; }
  const n = d.length / 4; let lo = 0, hi = 255, acc = 0;
  for (; lo < 255 && (acc += hist[lo]!) < n * .02; lo++);
  acc = 0; for (; hi > 0 && (acc += hist[hi]!) < n * .02; hi--);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, (d[i]! - lo) * 255 / range)); d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
}
/** Rotates clockwise by 90, 180 or 270 degrees. */
function rotateCanvas(source: HTMLCanvasElement, angle: number) {
  const out = document.createElement('canvas');
  out.width = angle === 180 ? source.width : source.height; out.height = angle === 180 ? source.height : source.width;
  const ctx = out.getContext('2d'); if (!ctx) throw new ReadingError('unreadable');
  ctx.translate(out.width / 2, out.height / 2); ctx.rotate(angle * Math.PI / 180); ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}
/** Loaded only by an explicit applicant action. OCR stays in this browser. */
export async function readDocument(bytes: Uint8Array, mime: string, progress: (message: string) => void,
  options: { signal?: AbortSignal; onProgress?: (value: ReadingProgress) => void; pages?: number[]; pageTimeoutMs?: number; onPagePreview?: (page: number, url: string, upright?: boolean) => void } = {}) {
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
    options.onProgress?.({ page: current, total: planned(), completed: outcomes.length,
      percent: Math.min(99, Math.round((outcomes.length + fraction) / planned() * 100)), phase, message });
  }
  function preview(n: number, source: HTMLCanvasElement) {
    if (!options.onPagePreview) return;
    const thumb = document.createElement('canvas'); const scale = 240 / Math.max(1, source.width);
    thumb.width = 240; thumb.height = Math.ceil(source.height * scale);
    try { thumb.getContext('2d')?.drawImage(source, 0, 0, thumb.width, thumb.height); options.onPagePreview(n, thumb.toDataURL('image/jpeg', .7)); }
    finally { thumb.width = 0; thumb.height = 0; }
  }
  /** Shows the page the way it is being read: turned upright. */
  function uprightPreview(n: number, source: HTMLCanvasElement, angle: number) {
    if (!options.onPagePreview) return;
    const thumb = document.createElement('canvas'); const scale = 240 / Math.max(1, Math.max(source.width, source.height));
    thumb.width = Math.ceil(source.width * scale); thumb.height = Math.ceil(source.height * scale);
    let turned: HTMLCanvasElement | undefined;
    try { thumb.getContext('2d')?.drawImage(source, 0, 0, thumb.width, thumb.height); turned = rotateCanvas(thumb, angle); options.onPagePreview(n, turned.toDataURL('image/jpeg', .75), true); }
    catch { /* preview is optional */ } finally { thumb.width = 0; thumb.height = 0; if (turned) { turned.width = 0; turned.height = 0; } }
  }
  function planned() { return options.pages?.filter(n => n <= total).length || total; }
  function terminate() {
    generation++;
    const old = worker; worker = undefined;
    void old?.terminate().catch(() => {});
  }
  async function ocrReady() {
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
  }
  async function ocr(canvas: HTMLCanvasElement) {
    await ocrReady();
    const reader = worker!;
    // Turn the page upright first: a quick low-resolution check of each orientation, then one full read.
    enhance(canvas);
    const found = await uprightAngle(reader, canvas);
    const angle = found.angle;
    if (angle) { uprightPreview(current, canvas, angle); report('ocr', `Page ${current} turned upright ✓`); }
    // Already read at full size the right way up: no second pass needed.
    if (found.data) return { text: found.data.text, confidence: found.data.confidence, rotated: angle !== 0, angle };
    const upright = angle ? rotateCanvas(canvas, angle) : canvas;
    try {
      if (angle) report('ocr', `Page ${current} turned upright · reading…`);
      const best = (await reader.recognize(upright, { rotateAuto: true })).data;
      return { text: best.text, confidence: best.confidence, rotated: angle !== 0, angle };
    } finally { if (upright !== canvas) { upright.width = 0; upright.height = 0; } }
  }
  async function uprightAngle(reader: Worker, canvas: HTMLCanvasElement) {
    const scale = Math.min(1, 1000 / Math.max(canvas.width, canvas.height));
    const probe = document.createElement('canvas');
    probe.width = Math.ceil(canvas.width * scale); probe.height = Math.ceil(canvas.height * scale);
    probe.getContext('2d')?.drawImage(canvas, 0, 0, probe.width, probe.height);
    let best: { angle: number; score: number; data?: { text: string; confidence: number } } = { angle: 0, score: -1 };
    try {
      for (const angle of [0, 90, 270, 180]) {
        if (options.signal?.aborted || worker !== reader) throw new ReadingError('interrupted');
        report('ocr', `Checking which way up page ${current} is…`);
        const view = angle ? rotateCanvas(probe, angle) : probe;
        try {
          const { data } = await reader.recognize(view);
          // Real words decide: upside-down or sideways text gives gibberish, even when confidence looks high.
          const score = realWords(data.text) * 5 + data.confidence / 10;
          if (score > best.score) best = { angle, score };
          if (angle === 0 && realWords(data.text) >= 12) break;
        } finally { if (view !== probe) { view.width = 0; view.height = 0; } }
      }
    } finally { probe.width = 0; probe.height = 0; }
    // Small, faint print can be unreadable in the quick check: check the sideways turns again at full size.
    if (best.score < 15) for (const angle of [90, 270]) {
      if (options.signal?.aborted || worker !== reader) throw new ReadingError('interrupted');
      report('ocr', `Looking closer at which way up page ${current} is…`);
      const view = rotateCanvas(canvas, angle);
      try {
        const { data } = await reader.recognize(view);
        const score = realWords(data.text) * 5 + data.confidence / 10;
        if (score > best.score) best = { angle, score, data };
      } finally { view.width = 0; view.height = 0; }
    }
    return best;
  }
  function record(page: Page) {
    const reliable = page.text.trim().length > 2 && (page.confidence === undefined || page.confidence >= 45);
    pages.push(page);
    const turned = page.angle ? { angle: page.angle } : {};
    outcomes.push(reliable ? { page: page.page, status: 'read', ...turned } : { page: page.page, status: 'uncertain', reason: 'unclear', ...turned });
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
          if (options.pages && !options.pages.includes(n)) continue;
          current = n;
          report('text', `Reading page ${n} of ${total}…`);
          let abandon = false; let stage = 'text' as 'text' | 'ocr';
          let render: { cancel: () => void } | undefined;
          try {
            const result = await withPageDeadline(async () => {
              const page = await pdf.getPage(n);
              try {
                if (options.onPagePreview) {
                  const small = page.getViewport({ scale: 240 / page.getViewport({ scale: 1 }).width });
                  const thumb = document.createElement('canvas'); thumb.width = Math.ceil(small.width); thumb.height = Math.ceil(small.height);
                  try { await page.render({ canvas: thumb, viewport: small }).promise; preview(n, thumb); } catch { /* preview is optional */ } finally { thumb.width = 0; thumb.height = 0; }
                }
                const content = await page.getTextContent();
                let text = ''; let lastY: number | undefined;
                for (const item of content.items) {
                  if (!('str' in item)) continue;
                  const y = item.transform[5];
                  if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 3) text += '\n';
                  text += item.str + (item.hasEOL ? '\n' : ' '); lastY = y;
                }
                if (usablePdfText(text)) {
                  if (classifyPage(text) !== 'cv') return { page: n, text, ocr: false };
                  // CV designs often keep contact details and dates in images or pale colours the text layer misses.
                  let layoutText: string | undefined;
                  const base = page.getViewport({ scale: 1 });
                  const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(base.width, base.height)) });
                  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                  try {
                    report('ocr', `Reading the design of page ${n} for contact details and dates…`);
                    const rendering = page.render({ canvas, viewport }); render = rendering; await rendering.promise;
                    if (abandon) throw new ReadingError('interrupted');
                    layoutEnhance(canvas);
                    // Extra details only: if this is slow, keep the text already read instead of losing the page.
                    layoutText = await withPageDeadline(async () => {
                      await ocrReady(); const reader = worker!;
                      // Automatic page layout keeps a CV's columns apart instead of mixing their lines.
                      await reader.setParameters({ tessedit_pageseg_mode: '3' as never });
                      try { return (await reader.recognize(canvas)).data.text; }
                      finally { if (worker === reader) await reader.setParameters({ tessedit_pageseg_mode: '6' as never }).catch(() => {}); }
                    }, terminate, options.signal, 60_000);
                  } catch (error) { if (abandon || options.signal?.aborted) throw error; } finally { canvas.width = 0; canvas.height = 0; }
                  return layoutText ? { page: n, text, ocr: false, layoutText } : { page: n, text, ocr: false };
                }
                if (abandon) throw new ReadingError('interrupted');
                stage = 'ocr';
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
            }, () => { abandon = true; render?.cancel(); terminate(); }, options.signal, options.pageTimeoutMs);
            record(result);
          } catch (error) {
            if (error instanceof ReadingError && error.code === 'limit') throw error;
            if (options.signal?.aborted) break;
            outcomes.push({ page: n, status: 'skipped', reason: stage === 'ocr' ? 'slow_scan' : 'error' });
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
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); preview(1, canvas);
          record({ page: 1, ...await withPageDeadline(() => ocr(canvas), terminate, options.signal, options.pageTimeoutMs), ocr: true });
        } finally { canvas.width = 0; canvas.height = 0; }
      } finally { bitmap.close(); }
    }
    if (!pages.some(p => p.text.trim().length > 2)) throw new ReadingError(options.signal?.aborted ? 'interrupted' : 'unreadable');
    const summary = readingSummary(outcomes, options.pages ? planned() : total, options.signal?.aborted === true);
    const text = `${summary}\n\n${pages.map(privatePageText).join('\n\n')}`;
    if (text.length > 100000) throw new ReadingError('limit');
    report('saving', 'Saving private results for review…');
    const unclear = new Set(outcomes.filter(o => o.status === 'uncertain').map(o => o.page));
    return { text, total, blocks: new Map(pages.map(p => [p.page, privatePageText(p)])), suggestions: suggestEntries(pages, unclear), pages, outcomes, summary,
      partial: outcomes.some(p => p.status !== 'read') || outcomes.length < planned(),
      method: pages.every(p => p.ocr) ? 'ocr' : pages.some(p => p.ocr) ? 'mixed' : 'pdf_text' };
  } finally { active = false; terminate(); }
}
