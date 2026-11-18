import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, FileSearch, LoaderCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { downloadCareerDocument } from '@/lib/career-documents.functions';
import { kindLabels, readingErrors, readingFields, ReadingError } from '@/modules/career/reading-rules';
import type { ReadingErrorCode, Suggestion, SuggestionKind } from '@/modules/career/reading-rules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { ReadingProgress } from '@/modules/career/reading-session';
import { mergeRetriedText, pageOverview, READING_TIP, RETRY_PAGE_TIMEOUT_MS, unreadPages } from '@/modules/career/reading-session';
import { renderPageThumbnails } from '@/modules/career/page-previews';

export function DocumentReading({ fileId, name }: { fileId: string; name: string }) {
  const qc = useQueryClient();
  const download = useServerFn(downloadCareerDocument);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [readingProgress, setReadingProgress] = useState<ReadingProgress>();
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [sourceMime, setSourceMime] = useState('');
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [livePage, setLivePage] = useState<number>();
  const sourceBytes = useRef<Uint8Array | undefined>(undefined);
  const onPagePreview = (page: number, url: string) => { setThumbs(t => ({ ...t, [page]: url })); setLivePage(page); };
  const reading = useQuery({
    queryKey: ['document-reading', fileId],
    queryFn: async () => {
      const { data, error } = await supabase.from('career_document_readings').select('*').eq('file_id', fileId).maybeSingle();
      if (error) throw new Error('Could not load the reading status.');
      return data;
    },
    refetchInterval: query => query.state.data?.status === 'processing' ? 5000 : false,
  });
  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => () => controller.current?.abort(), []);
  async function refresh() { await qc.invalidateQueries({ queryKey: ['document-reading', fileId] }); }
  function showSource(base64: string, mime: string) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    sourceBytes.current = bytes.slice();
    setSourceMime(mime);
    setSourceUrl(URL.createObjectURL(new Blob([bytes], { type: mime })));
    return bytes;
  }
  async function process(restart = false) {
    setBusy(true); setMessage('Loading private document…'); setElapsed(0); setStopping(false); setReadingProgress(undefined); setLivePage(undefined);
    controller.current = new AbortController();
    let token: string | undefined;
    try {
      const { data: claim, error } = await supabase.rpc(restart ? 'restart_document_reading' : 'begin_document_reading', { _file: fileId });
      if (error) throw new Error('Could not start reading.');
      if (!claim || typeof claim !== 'object' || Array.isArray(claim) || claim['started'] !== true || typeof claim['token'] !== 'string') {
        await refresh(); setOpen(true); return;
      }
      token = claim['token'];
      await refresh();
      const file = await download({ data: { fileId } });
      const bytes = showSource(file.base64, file.mimeType);
      const { readDocument } = await import('@/modules/career/read-document');
      const result = await readDocument(bytes, file.mimeType, setMessage, { signal: controller.current.signal, onProgress: setReadingProgress, onPagePreview });
      const { error: saveError } = await supabase.rpc('finish_document_reading', {
        _file: fileId, _token: token, _text: result.text,
        _suggestions: result.suggestions, _method: result.method,
      });
      if (saveError) throw new Error('Could not save the reading.');
      setOpen(true); await refresh();
      if (result.partial) toast.message('Readable results saved. Some pages need manual review.');
    } catch (error) {
      const code = error instanceof ReadingError ? error.code : 'interrupted';
      if (token) {
        await supabase.rpc('finish_document_reading', {
          _file: fileId, _token: token, _text: '', _suggestions: [], _method: 'ocr', _error: code,
        });
        await refresh();
      }
      toast.error(readingErrors[code]);
    } finally { setBusy(false); setMessage(''); controller.current = undefined; }
  }
  async function retryPages(pages: number[], savedText: string) {
    setBusy(true); setMessage('Loading private document…'); setElapsed(0); setStopping(false); setReadingProgress(undefined); setLivePage(undefined);
    controller.current = new AbortController();
    let token: string | undefined;
    try {
      const { data: claim, error } = await supabase.rpc('begin_page_retry', { _file: fileId });
      if (error || !claim || typeof claim !== 'object' || Array.isArray(claim) || typeof claim['token'] !== 'string') throw new Error('start');
      token = claim['token'];
      await refresh();
      const file = await download({ data: { fileId } });
      const bytes = showSource(file.base64, file.mimeType);
      const { readDocument } = await import('@/modules/career/read-document');
      const result = await readDocument(bytes, file.mimeType, setMessage, { signal: controller.current.signal, onProgress: setReadingProgress, onPagePreview, pages, pageTimeoutMs: RETRY_PAGE_TIMEOUT_MS });
      const merged = mergeRetriedText(savedText, pages, result.blocks, result.outcomes, result.total);
      const { error: saveError } = await supabase.rpc('finish_page_retry', { _file: fileId, _token: token, _text: merged.text, _suggestions: result.suggestions, _method: result.method });
      if (saveError) throw new Error('save');
      token = undefined; setOpen(true); await refresh();
      const still = merged.outcomes.filter(o => o.status !== 'read').length;
      if (still) toast.message(`New results added. ${still} page${still === 1 ? '' : 's'} still need manual review.`); else toast.success('All pages are now read.');
    } catch {
      toast.error('Those pages could not be read this time. Your earlier results are kept.');
    } finally {
      if (token) { await supabase.rpc('finish_page_retry', { _file: fileId, _token: token, _text: '', _suggestions: null, _method: 'ocr' }); await refresh(); }
      setBusy(false); setMessage(''); controller.current = undefined;
    }
  }
  async function review() {
    setOpen(value => !value);
    if (!sourceUrl) {
      try { const file = await download({ data: { fileId } }); showSource(file.base64, file.mimeType); }
      catch { toast.error('Could not open the source document.'); }
    }
  }
  const suggestions = (reading.data?.suggestions ?? []) as unknown as Suggestion[];
  const state = reading.data?.status ?? 'uploaded';
  const states: Record<string, string> = { uploaded: 'Uploaded', processing: 'Processing', review_required: 'Review required', completed: 'Completed', failed: 'Failed' };
  const stale = state === 'processing' && reading.data && Date.now() - new Date(reading.data.updated_at).getTime() >= 600000;
  const errorCode = reading.data?.error_code as ReadingErrorCode | null;
  const unread = reading.data && (state === 'review_required' || state === 'completed') ? unreadPages(reading.data.extracted_text).pages : [];
  const overview = reading.data?.extracted_text.startsWith('Reading summary:') ? pageOverview(reading.data.extracted_text) : undefined;
  const notRead = overview?.pages.filter(p => p.status !== 'read') ?? [];
  const thumbTotal = overview?.total ?? 0;
  useEffect(() => {
    const bytes = sourceBytes.current;
    if (!open || !sourceUrl || !bytes || busy) return;
    let live = true;
    void renderPageThumbnails(bytes, sourceMime, (n, url) => { if (live) setThumbs(t => ({ ...t, [n]: url })); }, n => !!thumbs[n] || n > thumbTotal).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceUrl, sourceMime, busy, thumbTotal]);
  return <div className="w-full min-w-0 border-t border-border pt-3">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{busy ? 'Reading' : states[state]}</Badge>
      {(state === 'uploaded' || state === 'failed' || stale) && <Button size="sm" variant="outline" disabled={busy || reading.isError} onClick={() => process()}>
        {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FileSearch aria-hidden="true" />}
        {state === 'uploaded' ? 'Read document' : 'Retry reading'}
      </Button>}
      {(state === 'review_required' || state === 'completed') && <Button size="sm" variant="outline" onClick={review}>{open ? 'Close review' : 'Review reading'}</Button>}
      {(state === 'review_required' || state === 'completed') && <Button size="sm" variant="outline" disabled={busy} onClick={() => {
        if (confirm('Read this document again? Pending suggestions will be replaced. Existing profile drafts and confirmed information will not change.')) void process(true);
      }}><FileSearch aria-hidden="true" />Read again</Button>}
      {unread.length > 0 && reading.data && <Button size="sm" disabled={busy} onClick={() => void retryPages(unread, reading.data!.extracted_text)}>
        <FileSearch aria-hidden="true" />Retry unread pages ({unread.join(', ')})
      </Button>}
    </div>
    {reading.isError && <p role="alert" className="mt-2 text-sm text-destructive">Could not load the reading status. <Button size="sm" variant="link" onClick={refresh}>Try again</Button></p>}
    {busy && <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm"><span role="status">{stopping ? 'Stopping and keeping readable results…' : message}</span><span className="shrink-0 text-muted-foreground">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span></div>
      {livePage && thumbs[livePage] && <div className="flex items-center gap-3">
        <img src={thumbs[livePage]} alt={`Preview of page ${livePage} being read`} className="w-20 shrink-0 rounded-md border border-border" />
        <p className="text-sm font-medium">Now reading page {livePage}{readingProgress ? ` of ${readingProgress.total}` : ''}</p>
      </div>}
      <Progress value={readingProgress?.percent ?? 0} aria-label="Document reading progress" />
      {readingProgress && <p className="text-xs text-muted-foreground">{readingProgress.completed} of {readingProgress.total} pages processed</p>}
      <Button size="sm" variant="outline" disabled={stopping || readingProgress?.phase === 'saving'} onClick={() => { setStopping(true); controller.current?.abort(); }}><X aria-hidden="true" />Stop reading</Button>
    </div>}
    {state === 'processing' && !busy && <p className="mt-2 text-sm text-muted-foreground">{stale ? 'Reading was interrupted. You can retry.' : 'Reading is in progress. Keep the page where you started it open.'}</p>}
    {state === 'failed' && errorCode && !busy && <p role="alert" className="mt-2 text-sm text-destructive">{readingErrors[errorCode] ?? readingErrors.unreadable}</p>}
    {open && reading.data && (state === 'review_required' || state === 'completed') && <div className="mt-4 grid min-w-0 gap-5">
      <h3 className="font-semibold">Review — {name}</h3>
      {overview && <p role="status" className="text-sm text-muted-foreground">{overview.headline}</p>}
      {notRead.length > 0 && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-destructive"><AlertTriangle className="size-4 shrink-0" aria-hidden="true" />{notRead.length === 1 ? `Page ${notRead[0]?.page} could not be read` : `Pages ${notRead.map(p => p.page).join(', ')} could not be read`}</p>
        <ul className="mt-2 space-y-1">{notRead.map(p => <li key={p.page}><span className="font-medium">Page {p.page}:</span> {p.reason}</li>)}</ul>
        <p className="mt-2 text-muted-foreground">{READING_TIP.replace(/^Tip: /, 'What to do: ')}</p>
      </div>}
      <p className="text-sm text-muted-foreground">Check each suggestion against its page. Accepted entries are saved as drafts, not confirmed profile information.</p>
      {overview ? <div className="grid min-w-0 gap-3">
        {overview.pages.map(p => {
          const items = suggestions.map((s, index) => ({ s, index })).filter(({ s }) => s.page === p.page);
          const identity = p.label === 'Identity document';
          return <section key={p.page} aria-label={`Page ${p.page}`} className="min-w-0 rounded-md border border-border p-3">
            <div className="flex gap-3">
              {thumbs[p.page] ?? (p.page === 1 && sourceMime !== 'application/pdf' ? sourceUrl : undefined)
                ? <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
                    <img src={thumbs[p.page] ?? sourceUrl} alt={`Page ${p.page} preview${p.angle ? ', shown upright' : ''}`} style={p.angle ? { transform: `rotate(${p.angle}deg)` } : undefined}
                      className={`max-h-full max-w-full object-contain ${p.angle === 90 || p.angle === 270 ? 'scale-75' : ''} ${identity ? 'blur-sm' : ''}`} />
                  </div>
                : <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded border border-border bg-muted text-xs text-muted-foreground">Page {p.page}</div>}
              <div className="min-w-0 space-y-1">
                <p className="font-medium">Page {p.page}{p.label ? ` · ${p.label}` : ''}</p>
                <Badge variant={p.status === 'read' ? 'secondary' : 'destructive'}>{p.status === 'read' ? 'Read' : p.status === 'uncertain' ? 'Unclear' : 'Not read'}</Badge>
                {p.angle > 0 && <p className="text-xs text-muted-foreground">This page was sideways or upside down and was turned upright before reading.</p>}
                {p.reason && <p className="text-xs text-muted-foreground">{p.reason}{p.status === 'uncertain' && items.length ? ' Some rows could still be read — check each one carefully against the page.' : ''}</p>}
                <p className="text-xs text-muted-foreground">{identity ? 'Identity details are never added to your profile.' : items.length ? `${items.length} suggestion${items.length === 1 ? '' : 's'} from this page` : p.status === 'read' ? 'No profile entries found on this page.' : 'No suggestions from this page.'}</p>
              </div>
            </div>
            {items.length > 0 && <PageSuggestions items={items} fileId={fileId} refresh={refresh} />}
          </section>;
        })}
      </div> : <div className="min-w-0 space-y-4">{suggestions.map((suggestion, index) => <SuggestionReview key={`${fileId}-${index}`} suggestion={suggestion} index={index} fileId={fileId} refresh={refresh} />)}</div>}
      {suggestions.length === 0 && <p className="text-sm text-muted-foreground">Text was read, but no profile entries could be identified reliably. You can enter them in <Link to="/profile" className="text-primary underline">My career profile</Link>.</p>}
      {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Open the full source document</a>}
      <details>
        <summary className="cursor-pointer text-sm font-medium">Extracted text (identity details withheld)</summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{reading.data.extracted_text}</pre>
      </details>
      <div className="space-y-3">
          {state === 'review_required' && <Button disabled={suggestions.some(s => s.status === 'pending')} onClick={async () => {
            const { error } = await supabase.rpc('complete_document_review', { _file: fileId });
            if (error) toast.error('Please review every suggestion first.'); else { await refresh(); toast.success('Document review completed.'); }
          }}><Check aria-hidden="true" />Finish document review</Button>}
          <Link to="/profile" className="block text-sm font-medium text-primary underline">Review and confirm profile drafts</Link>
      </div>
    </div>}
  </div>;
}

const kindOrder: SuggestionKind[] = ['personal', 'qualification', 'education', 'result', 'experience', 'skill'];
function PageSuggestions({ items, fileId, refresh }: { items: { s: Suggestion; index: number }[]; fileId: string; refresh: () => Promise<void> }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const pending = items.filter(({ s }) => s.status === 'pending');
  async function acceptAll() {
    setBusy(true);
    try {
      for (const { s, index } of pending) {
        const { error } = await supabase.rpc('review_document_suggestion', { _file: fileId, _index: index, _accept: true, _data: s.data });
        if (error) { toast.error('Some suggestions could not be saved. Please review them one by one.'); break; }
      }
      await refresh(); await qc.invalidateQueries({ queryKey: ['career-profile'] });
      toast.success('Accepted as profile drafts. Anything already in your profile was not added twice.');
    } finally { setBusy(false); }
  }
  return <div className="mt-3 space-y-4">
    {pending.length > 1 && <Button size="sm" disabled={busy} onClick={acceptAll}><Check aria-hidden="true" />Accept all {pending.length} from this page as drafts</Button>}
    {kindOrder.map(kind => {
      const group = items.filter(({ s }) => s.kind === kind);
      if (!group.length) return null;
      return <div key={kind} className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{kindLabels[kind]}{group.length > 1 ? ` (${group.length})` : ''}</h4>
        {group.map(({ s, index }) => <SuggestionReview key={`${fileId}-${index}`} suggestion={s} index={index} fileId={fileId} refresh={refresh} />)}
      </div>;
    })}
  </div>;
}

function SuggestionReview({ suggestion, index, fileId, refresh }: { suggestion: Suggestion; index: number; fileId: string; refresh: () => Promise<void> }) {
  const qc = useQueryClient();
  const [data, setData] = useState(suggestion.data);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const fields = readingFields[suggestion.kind];
  if (!fields) return null;
  async function isDuplicate() {
    const { data: row } = await supabase.from('career_document_readings').select('suggestions').eq('file_id', fileId).maybeSingle();
    const list = (row?.suggestions ?? []) as unknown as (Suggestion & { duplicate?: boolean })[];
    return list[index]?.duplicate === true;
  }
  async function decide(accept: boolean) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('review_document_suggestion', { _file: fileId, _index: index, _accept: accept, _data: data });
      const duplicate = !error && accept && await isDuplicate();
      if (error) { toast.error('Could not save your review. Please try again.'); return; }
      await refresh(); await qc.invalidateQueries({ queryKey: ['career-profile'] });
      toast.success(!accept ? 'Suggestion rejected.' : duplicate ? 'Already in your profile — no duplicate added.' : 'Accepted as a profile draft.');
    } finally { setBusy(false); }
  }
  const [main, ...rest] = fields;
  const details = rest.filter(f => data[f.key]);
  const missing = rest.filter(f => !data[f.key]).map(f => f.label.toLowerCase());
  return <div className={`min-w-0 rounded-md border border-border p-3 ${suggestion.status !== 'pending' ? 'bg-muted/50' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="break-words font-medium">{data[main?.key ?? ''] || '—'}</p>
        {details.length > 0 && <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[auto_1fr]">
          {details.map(f => <div key={f.key} className="contents"><dt className="text-muted-foreground">{f.label}</dt><dd className="break-words">{data[f.key]}</dd></div>)}
        </dl>}
        {suggestion.status === 'pending' && missing.length > 0 && !editing && <p className="mt-1 text-xs text-muted-foreground">Not found on the page: {missing.join(', ')}. Add them with Edit if you know them.</p>}
      </div>
      {suggestion.status !== 'pending' && <Badge variant="outline">{suggestion.status === 'accepted' ? 'Accepted as draft' : 'Rejected'}</Badge>}
    </div>
    {suggestion.status === 'pending' && <>
      {editing && <div className="mt-3 grid gap-2">{fields.map(field => <div key={field.key} className="grid gap-1">
        <Label htmlFor={`${fileId}-${index}-${field.key}`}>{field.label}</Label>
        <Input id={`${fileId}-${index}-${field.key}`} value={data[field.key] ?? ''} maxLength={200} onChange={e => setData({ ...data, [field.key]: e.target.value })} />
      </div>)}</div>}
      <details className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">Where this came from</summary>
        <blockquote className="mt-1 whitespace-pre-line break-words border-l-2 border-border pl-3 text-xs text-muted-foreground">{suggestion.source}</blockquote>
      </details>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !data[main?.key ?? '']?.trim()} onClick={() => decide(true)}><Check aria-hidden="true" />Accept</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(v => !v)}>{editing ? 'Done editing' : 'Edit'}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(false)}><X aria-hidden="true" />Reject</Button>
      </div>
    </>}
  </div>;
}
