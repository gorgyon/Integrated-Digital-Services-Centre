import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAGE_READING_TIMEOUT_MS, usablePdfText, withPageDeadline, readingSummary, unreadPages, mergeRetriedText } from '@/modules/career/reading-session';

afterEach(() => vi.useRealTimers());
describe('bounded private document reading', () => {
  it('uses readable PDF text even when a page also contains images', () => {
    expect(usablePdfText('National Senior Certificate awarded by Example Secondary School in 2012')).toBe(true);
    expect(usablePdfText('x 1 2 || ~ 00 l')).toBe(false);
  });
  it('stops a stalled page at 60 seconds instead of losing the entire document', async () => {
    vi.useFakeTimers(); const stop = vi.fn();
    const result = withPageDeadline(() => new Promise(() => {}), stop);
    const check = expect(result).rejects.toMatchObject({ code: 'interrupted' });
    await vi.advanceTimersByTimeAsync(PAGE_READING_TIMEOUT_MS);
    await check; expect(stop).toHaveBeenCalledOnce();
  });
  it('lets an applicant stop a page immediately', async () => {
    const controller = new AbortController(); const stop = vi.fn();
    const result = withPageDeadline(() => new Promise(() => {}), stop, controller.signal);
    controller.abort(); await expect(result).rejects.toMatchObject({ code: 'interrupted' });
    expect(stop).toHaveBeenCalledOnce();
  });
  it('distinguishes successful, uncertain and skipped pages in a partial result', () => {
    const summary = readingSummary([{ page: 1, status: 'read' }, { page: 2, status: 'uncertain' }, { page: 3, status: 'skipped' }], 7, true);
    expect(summary).toContain('1 of 7'); expect(summary).toContain('pages 2');
    expect(summary).toContain('Pages 3'); expect(summary).toContain('4 pages not attempted');
  });
  it('finds only the unread pages and keeps earlier pages when they are retried', () => {
    const saved = 'Reading summary: 4 of 7 pages read reliably.\nPages 4, 5, 6 could not be read within the page time limit or encountered an error.\n\n'
      + [1, 2, 3, 7].map(n => `Page ${n} — CV\ntext ${n}`).join('\n\n');
    expect(unreadPages(saved).pages).toEqual([4, 5, 6]);
    const merged = mergeRetriedText(saved, [4, 5, 6], new Map([[4, 'Page 4 — Transcript\nmodules']]),
      [{ page: 4, status: 'read' }, { page: 5, status: 'skipped' }, { page: 6, status: 'skipped' }], 7);
    expect(merged.text).toContain('5 of 7 pages read reliably');
    expect(merged.text).toContain('text 1'); expect(merged.text).toContain('text 7'); expect(merged.text).toContain('modules');
    expect(unreadPages(merged.text).pages).toEqual([5, 6]);
  });
});
