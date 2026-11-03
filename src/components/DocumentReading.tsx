import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileSearch, LoaderCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { downloadCareerDocument } from '@/lib/career-documents.functions';
import { readingErrors, readingFields, ReadingError } from '@/modules/career/reading-rules';
import type { ReadingErrorCode, Suggestion } from '@/modules/career/reading-rules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export function DocumentReading({ fileId, name }: { fileId: string; name: string }) {
  const qc = useQueryClient();
  const download = useServerFn(downloadCareerDocument);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [sourceMime, setSourceMime] = useState('');
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
  async function refresh() { await qc.invalidateQueries({ queryKey: ['document-reading', fileId] }); }
  function showSource(base64: string, mime: string) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    setSourceMime(mime);
    setSourceUrl(URL.createObjectURL(new Blob([bytes], { type: mime })));
    return bytes;
  }
  async function process() {
    setBusy(true); setMessage('Loading private document…');
    let token: string | undefined;
    try {
      const { data: claim, error } = await supabase.rpc('begin_document_reading', { _file: fileId });
      if (error) throw new Error('Could not start reading.');
      if (!claim || typeof claim !== 'object' || Array.isArray(claim) || claim['started'] !== true || typeof claim['token'] !== 'string') {
        await refresh(); setOpen(true); return;
      }
      token = claim['token'];
      await refresh();
      const file = await download({ data: { fileId } });
      const bytes = showSource(file.base64, file.mimeType);
      const { readDocument } = await import('@/modules/career/read-document');
      const result = await readDocument(bytes, file.mimeType, setMessage);
      const { error: saveError } = await supabase.rpc('finish_document_reading', {
        _file: fileId, _token: token, _text: result.text,
        _suggestions: result.suggestions, _method: result.method,
      });
      if (saveError) throw new Error('Could not save the reading.');
      setOpen(true); await refresh();
    } catch (error) {
      const code = error instanceof ReadingError ? error.code : 'interrupted';
      if (token) {
        await supabase.rpc('finish_document_reading', {
          _file: fileId, _token: token, _text: '', _suggestions: [], _method: 'ocr', _error: code,
        });
        await refresh();
      }
      toast.error(readingErrors[code]);
    } finally { setBusy(false); setMessage(''); }
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
  return <div className="w-full min-w-0 border-t border-border pt-3">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{states[state]}</Badge>
      {(state === 'uploaded' || state === 'failed' || stale) && <Button size="sm" variant="outline" disabled={busy || reading.isError} onClick={process}>
        {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FileSearch aria-hidden="true" />}
        {state === 'uploaded' ? 'Read document' : 'Retry reading'}
      </Button>}
      {(state === 'review_required' || state === 'completed') && <Button size="sm" variant="outline" onClick={review}>{open ? 'Close review' : 'Review reading'}</Button>}
    </div>
    {reading.isError && <p role="alert" className="mt-2 text-sm text-destructive">Could not load the reading status. <Button size="sm" variant="link" onClick={refresh}>Try again</Button></p>}
    {busy && <p role="status" className="mt-2 text-sm text-muted-foreground">{message}</p>}
    {state === 'processing' && !busy && <p className="mt-2 text-sm text-muted-foreground">{stale ? 'Reading was interrupted. You can retry.' : 'Reading is in progress. Keep the page where you started it open.'}</p>}
    {state === 'failed' && errorCode && <p role="alert" className="mt-2 text-sm text-destructive">{readingErrors[errorCode] ?? readingErrors.unreadable}</p>}
    {open && reading.data && (state === 'review_required' || state === 'completed') && <div className="mt-4 grid min-w-0 gap-5">
      <h3 className="font-semibold">Review — {name}</h3>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <h4 className="mb-2 text-sm font-medium">Source document</h4>
          {sourceUrl && <>
            {sourceMime === 'application/pdf'
              ? <iframe title={`Source document: ${name}`} src={sourceUrl} className="h-80 w-full rounded-md border border-border" />
              : <img src={sourceUrl} alt={`Source document: ${name}`} className="max-h-80 w-full rounded-md border border-border object-contain" />}
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-primary underline">Open source document</a>
          </>}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium">Original extracted text</summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{reading.data.extracted_text}</pre>
          </details>
        </div>
        <div className="min-w-0 space-y-4">
          <p className="text-sm text-muted-foreground">Check each suggestion against your document. Accepted entries are saved as drafts, not confirmed profile information.</p>
          {suggestions.length === 0 && <p className="text-sm text-muted-foreground">Text was read, but no profile entries could be identified reliably. You can enter them in <Link to="/profile" className="text-primary underline">My career profile</Link>.</p>}
          {suggestions.map((suggestion, index) => <SuggestionReview key={`${fileId}-${index}`} suggestion={suggestion} index={index} fileId={fileId} refresh={refresh} />)}
          {state === 'review_required' && <Button disabled={suggestions.some(s => s.status === 'pending')} onClick={async () => {
            const { error } = await supabase.rpc('complete_document_review', { _file: fileId });
            if (error) toast.error('Please review every suggestion first.'); else { await refresh(); toast.success('Document review completed.'); }
          }}><Check aria-hidden="true" />Finish document review</Button>}
          <Link to="/profile" className="block text-sm font-medium text-primary underline">Review and confirm profile drafts</Link>
        </div>
      </div>
    </div>}
  </div>;
}

function SuggestionReview({ suggestion, index, fileId, refresh }: { suggestion: Suggestion; index: number; fileId: string; refresh: () => Promise<void> }) {
  const qc = useQueryClient();
  const [data, setData] = useState(suggestion.data);
  const [busy, setBusy] = useState(false);
  const fields = readingFields[suggestion.kind];
  if (!fields) return null;
  async function decide(accept: boolean) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('review_document_suggestion', { _file: fileId, _index: index, _accept: accept, _data: data });
      if (error) { toast.error('Could not save your review. Please try again.'); return; }
      await refresh(); await qc.invalidateQueries({ queryKey: ['career-profile'] });
      toast.success(accept ? 'Accepted as a profile draft.' : 'Suggestion rejected.');
    } finally { setBusy(false); }
  }
  return <section className="min-w-0 border-b border-border pb-4">
    <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="capitalize">{suggestion.kind}</span><span className="text-xs text-muted-foreground">Page {suggestion.page}</span><Badge variant="outline">{suggestion.status === 'pending' ? 'Check wording and missing details' : suggestion.status === 'accepted' ? 'Accepted as draft' : 'Rejected'}</Badge></div>
    <blockquote className="my-2 break-words border-l-2 border-border pl-3 text-xs text-muted-foreground">{suggestion.source}</blockquote>
    {suggestion.status === 'pending' && <>
      <div className="grid gap-2">{fields.map(field => <div key={field.key} className="grid gap-1">
        <Label htmlFor={`${fileId}-${index}-${field.key}`}>{field.label}</Label>
        <Input id={`${fileId}-${index}-${field.key}`} value={data[field.key] ?? ''} maxLength={200} onChange={e => setData({ ...data, [field.key]: e.target.value })} />
      </div>)}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !data[fields[0]?.key ?? '']?.trim()} onClick={() => decide(true)}><Check aria-hidden="true" />Accept as draft</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(false)}><X aria-hidden="true" />Reject</Button>
      </div>
    </>}
  </section>;
}