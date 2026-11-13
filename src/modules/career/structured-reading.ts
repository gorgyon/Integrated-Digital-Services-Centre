import type { Suggestion, SuggestionKind } from './reading-rules';

export type DocumentType = 'cv' | 'identity' | 'matric' | 'diploma' | 'degree' | 'transcript' | 'supporting';
export type ReadingPage = { page: number; text: string; ocr: boolean };
export const documentLabels: Record<DocumentType, string> = {
  cv: 'CV', identity: 'Identity document', matric: 'Matric certificate', diploma: 'Diploma',
  degree: 'Degree', transcript: 'Academic transcript', supporting: 'Supporting document',
};
const qualificationPattern = /\b(?:national senior certificate|senior certificate|matric(?:ulation)?|grade 12|(?:national |advanced |higher |postgraduate )?diploma(?: in [\w &(),/-]+)?|(?:higher |national )?certificate in [\w &(),/-]+|(?:bachelor|master|doctor)(?: of|['’]s)? [\w &(),/-]+|(?:bsc|bcom|beng|ba|btech|msc|mba|phd)(?:\s+(?:in|of)\s+[\w &(),/-]+)?|degree in [\w &(),/-]+)\b/i;
const boilerplate = /\b(this (?:candidate|certificate|document)|hereby|awarded to|has been awarded|certify that|certifies that|in accordance|all rights reserved|(?:certificate|document) verification|verify (?:this|at)|document reference|certificate (?:number|no)|registration (?:number|no)|identity (?:number|no)|id (?:number|no)|issued under|signed on behalf|not transferable|legal notice|page \d+ of|copyright)\b/i;
const identity = /\b(identity (?:document|card)|identification card|smart id|republic of south africa[\s\S]{0,100}identity|passport)\b/i;
const yearFrom = (s: string) => {
  const years = s.match(/\b(?:19|20)\d{2}\b/g);
  return years?.length === 1 ? years[0] : undefined;
};
const clean = (s: string) => s.trim().replace(/^[•●\-*]\s*/, '').replace(/\s+/g, ' ');
const safeLine = (s: string) => s.replace(/\b\d{13}\b/g, '[identity number withheld]')
  .replace(/\b(?:ID|identity|passport)\s*(?:number|no\.?)\s*[:#-]?\s*\S+/gi, '[identity detail withheld]');
export function classifyPage(text: string): DocumentType {
  // Identity takes priority: never interpret security text on IDs as education.
  if (identity.test(text)) return 'identity';
  if (/\b(?:academic (?:record|transcript|results)|transcript|statement of results)\b/i.test(text)) return 'transcript';
  if (/\b(?:curriculum vitae|resume|résumé|work experience|employment history|professional experience)\b/i.test(text) || /\beducation\b/i.test(text) && /\bskills\b/i.test(text)) return 'cv';
  if (/\b(?:national senior certificate|senior certificate|matric certificate)\b/i.test(text)) return 'matric';
  if (/\bdiploma\b/i.test(text)) return 'diploma';
  if (/\b(?:bachelor|master|doctor of|degree|bsc|bcom|beng|msc|phd)\b/i.test(text)) return 'degree';
  return 'supporting';
}
export function privatePageText(page: ReadingPage) {
  const type = classifyPage(page.text);
  return `Page ${page.page} — ${documentLabels[type]}\n${type === 'identity' ? '[Identity details withheld. Original document remains private.]' : page.text.split(/\r?\n/).map(safeLine).join('\n')}`;
}
function heading(line: string): SuggestionKind | 'ignore' | undefined {
  const h = line.replace(/:$/, '').toLowerCase();
  if (/^(education|academic background|education and training)$/.test(h)) return 'education';
  if (/^(qualifications|certifications|certificates)$/.test(h)) return 'qualification';
  if (/^(academic results|results|transcript|subjects|subject results)$/.test(h)) return 'result';
  if (/^(skills|technical skills|key skills|competencies)$/.test(h)) return 'skill';
  if (/^(employment history|work experience|professional experience|experience)$/.test(h)) return 'experience';
  if (/^(references|contact details|personal details|profile|summary|interests|languages|declaration|achievements|responsibilities|duties)$/.test(h)) return 'ignore';
  return undefined;
}
const organisation = (s: string) => /\b(university|college|school|institute|academy|technikon)\b/i.test(s) && !boilerplate.test(s);
function labelled(lines: string[], pattern: RegExp): string | undefined {
  for (const line of lines) { const match = line.match(pattern); if (match?.[1]) return match[1].trim().slice(0, 200); }
  return undefined;
}
export function structuredSuggestions(pages: ReadingPage[]): Suggestion[] {
  const out: Suggestion[] = [];
  let carriedSection: SuggestionKind | undefined;
  const add = (kind: SuggestionKind, data: Record<string, string>, source: string, page: ReadingPage) => {
    if (!Object.values(data).some(Boolean) || out.length >= 100) return;
    const key = kind === 'qualification' ? 'title' : kind === 'education' ? 'institution' : kind === 'result' ? 'subject' : kind === 'skill' ? 'name' : 'role';
    const normalize = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const qualifiers = kind === 'qualification' ? ['issuer','field','year'] : kind === 'education' ? ['level','field','year'] : kind === 'result' ? ['grade','year'] : kind === 'experience' ? ['employer','period'] : [];
    const prior = out.find(s => s.kind === kind && normalize(s.data[key]) === normalize(data[key]) && qualifiers.every(k => !s.data[k] || !data[k] || normalize(s.data[k]) === normalize(data[k])));
    if (prior) return; // Keep first page provenance; never merge uncertain facts across documents/pages.
    out.push({ kind, data, source: safeLine(source).slice(0, 2000), page: page.page, uncertain: true, status: 'pending', documentType: classifyPage(page.text) });
  };
  for (const page of pages) {
    const type = classifyPage(page.text);
    if (type === 'identity') { carriedSection = undefined; continue; }
    const lines = page.text.split(/\r?\n/).map(clean).filter(s => s && s.length <= 2000).map(safeLine);
    let section = type === 'transcript' ? 'result' as const : type === 'cv' || type === 'supporting' ? carriedSection : undefined;
    const consumed = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || consumed.has(i)) continue;
      const nextHeading = heading(line);
      if (nextHeading) { section = nextHeading === 'ignore' ? undefined : nextHeading; continue; }
      if (boilerplate.test(line) || /\[identity|https?:|@/.test(line)) continue;
      // Only explicit subject + mark, never arbitrary percentage sentences.
      const result = line.match(/^([A-Za-z][A-Za-z &()/-]{1,90}?)\s*[:|–-]?\s+(\d{1,3}(?:\.\d+)?\s*%|[A-F][+-]?)(?:\s+(\d{4}))?$/);
      if (result && !/\b(?:is|was|are|rate|average|total|overall|minimum|achieved|obtained|passed)\b/i.test(result[1] ?? '') && (section === 'result' || type === 'transcript' || type === 'matric')) {
        const data: Record<string,string> = { subject: result[1]?.trim() ?? '', grade: result[2] ?? '' };
        const year = result[3] ?? yearFrom(lines.filter(l => /(?:completed|completion|year|examination)/i.test(l)).join(' '));
        if (year) data['year'] = year;
        const mark = data['grade'] ?? '';
        if (!mark.includes('%') || parseFloat(mark) <= 100) add('result', data, line, page);
        continue;
      }
      const qualification = line.match(qualificationPattern);
      if (qualification && !/^(?:subject|course|module)\s*:/i.test(line)) {
        // Group explicit nearby fields, stopping at the next section/qualification.
        const block = [line];
        for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
          const neighbour = lines[j];
          if (!neighbour || heading(neighbour) || qualificationPattern.test(neighbour)) break;
          if (boilerplate.test(neighbour)) continue;
          if (organisation(neighbour) || /^(?:institution|issued by|issuer|field of study|completed|completion|year)\s*:/i.test(neighbour) || /^(?:19|20)\d{2}$/.test(neighbour)) { block.push(neighbour); consumed.add(j); }
        }
        const title = qualification[0].replace(/\s*[,|–-]?\s*\b(?:19|20)\d{2}\b.*$/, '').trim().slice(0, 200);
        const data: Record<string,string> = { title };
        const issuer = labelled(block, /^(?:institution|issued by|issuer)\s*:\s*(.+)$/i) ?? block.find(l => l !== line && organisation(l));
        if (issuer) data['issuer'] = issuer;
        const field = labelled(block, /^field of study\s*:\s*(.+)$/i) ?? title.match(/\b(?:in|of)\s+(.+)$/i)?.[1];
        if (field) data['field'] = field;
        const year = yearFrom(block.join(' ')); if (year) data['year'] = year;
        add('qualification', data, block.join('\n'), page);
        continue;
      }
      if (section === 'education' && organisation(line)) {
        const data: Record<string,string> = { institution: line.slice(0,200) };
        const next = lines[i + 1];
        if (next && /^grade\s+(?:[1-9]|1[01])\b/i.test(next)) { data['level'] = next.replace(/\s*[,|–-]?\s*\b(?:19|20)\d{2}\b.*$/, ''); const year = yearFrom(next); if (year) data['year'] = year; consumed.add(i + 1); }
        add('education', data, next && data['level'] ? `${line}\n${next}` : line, page);
      } else if (section === 'skill' && line.length <= 160 && !/[.!?]$/.test(line)) {
        for (const part of line.split(/[,;|•]/)) { const name = part.trim(); if (name.length >= 2 && name.length <= 80 && !/^\d+$/.test(name) && name.split(' ').length <= 8) add('skill', { name }, name, page); }
      } else if (section === 'experience' && line.length <= 180 && !/[.!?]$/.test(line) && !/^\d/.test(line)) {
        const match = line.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[|,]\s*((?:19|20)\d{2}.*))?$/i);
        const data: Record<string,string> = { role: (match?.[1] ?? line).slice(0,200) };
        if (match?.[2]) data['employer'] = match[2];
        if (match?.[3]) data['period'] = match[3];
        const next = lines[i + 1];
        if (next && /^(?:dates|period|employer)\s*:/i.test(next)) {
          const employer = labelled([next], /^employer\s*:\s*(.+)$/i); const period = labelled([next], /^(?:dates|period)\s*:\s*(.+)$/i);
          if (employer) data['employer'] = employer; if (period) data['period'] = period; consumed.add(i + 1);
        }
        add('experience', data, line, page);
      }
    }
    carriedSection = type === 'cv' || type === 'supporting' ? section : undefined;
  }
  return out;
}
