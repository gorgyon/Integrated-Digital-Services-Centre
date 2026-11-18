import { ReadingError } from './reading-rules';

export const PAGE_READING_TIMEOUT_MS = 60_000;
export type PageOutcome = { page: number; status: 'read' | 'uncertain' | 'skipped' };
export type ReadingProgress = {
  page: number; total: number; completed: number; percent: number;
  phase: 'opening' | 'text' | 'ocr' | 'saving'; message: string;
};

/** Logos/photos alone are not a reason to OCR a usable selectable text layer. */
export function usablePdfText(text: string) {
  const words = text.match(/[A-Za-z]{2,}/g) ?? [];
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  return words.length >= 8 && letters / Math.max(1, text.replace(/\s/g, '').length) >= .55;
}

export async function withPageDeadline<T>(work: () => Promise<T>, stop: () => void, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new ReadingError('interrupted');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        abort = () => { stop(); reject(new ReadingError('interrupted')); };
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(abort, PAGE_READING_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  }
}

export function readingSummary(outcomes: PageOutcome[], total: number, stopped: boolean) {
  const read = outcomes.filter(p => p.status === 'read').length;
  const uncertain = outcomes.filter(p => p.status === 'uncertain').map(p => p.page);
  const skipped = outcomes.filter(p => p.status === 'skipped').map(p => p.page);
  const notes = [`Reading summary: ${read} of ${total} pages read reliably.`];
  if (uncertain.length) notes.push(`Unclear text on pages ${uncertain.join(', ')}. Check the original; no suggestions were generated from these pages.`);
  if (skipped.length) notes.push(`Pages ${skipped.join(', ')} could not be read within the page time limit or encountered an error.`);
  if (stopped) notes.push(`Reading stopped early. ${total - outcomes.length} pages not attempted.`);
  return notes.join('\n');
}