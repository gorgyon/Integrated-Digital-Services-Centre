import { ReadingError } from './reading-rules';

export const PAGE_READING_TIMEOUT_MS = 60_000;
/** Retrying a few hard pages (often sideways scans) gets more time per page. */
export const RETRY_PAGE_TIMEOUT_MS = 180_000;
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

export async function withPageDeadline<T>(work: () => Promise<T>, stop: () => void, signal?: AbortSignal, timeoutMs = PAGE_READING_TIMEOUT_MS): Promise<T> {
  if (signal?.aborted) throw new ReadingError('interrupted');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        abort = () => { stop(); reject(new ReadingError('interrupted')); };
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(abort, timeoutMs);
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

function pageList(text: string) { return text.split(/,\s*/).map(Number).filter(n => Number.isInteger(n) && n > 0); }
/** Pages a saved reading could not read reliably, taken from its summary. */
export function unreadPages(savedText: string) {
  const summary = savedText.startsWith('Reading summary:') ? savedText.split('\n\n')[0] ?? '' : '';
  const total = Number(/of (\d+) pages read reliably/.exec(summary)?.[1] ?? 0);
  const pages = new Set<number>();
  for (const m of summary.matchAll(/(?:Unclear text on pages|Pages) ([\d, ]+?)(?:\.| could)/g)) pageList(m[1] ?? '').forEach(n => pages.add(n));
  const blocks = new Set(splitPageBlocks(savedText).keys());
  if (/Reading stopped early/.test(summary)) for (let n = 1; n <= total; n++) if (!blocks.has(n)) pages.add(n);
  return { total, pages: [...pages].sort((a, b) => a - b) };
}
function splitPageBlocks(savedText: string) {
  const blocks = new Map<number, string>();
  for (const part of savedText.split(/\n\n(?=Page \d+ — )/).slice(1)) {
    const n = Number(/^Page (\d+) — /.exec(part)?.[1]); if (n) blocks.set(n, part);
  }
  return blocks;
}
/** Combines a saved reading with a retry of some pages, keeping every earlier page. */
export function mergeRetriedText(savedText: string, retried: number[], newBlocks: Map<number, string>, newOutcomes: PageOutcome[], total: number) {
  const old = splitPageBlocks(savedText); const before = unreadPages(savedText).pages;
  const outcomes: PageOutcome[] = []; const parts: string[] = [];
  for (let n = 1; n <= total; n++) {
    const fresh = newOutcomes.find(o => o.page === n);
    if (retried.includes(n) && fresh && fresh.status !== 'skipped' && newBlocks.has(n)) { outcomes.push(fresh); parts.push(newBlocks.get(n)!); continue; }
    const block = old.get(n);
    if (block) parts.push(block);
    outcomes.push({ page: n, status: before.includes(n) ? (block ? 'uncertain' : 'skipped') : 'read' });
  }
  return { outcomes, text: `${readingSummary(outcomes, total, false)}\n\n${parts.join('\n\n')}` };
}
