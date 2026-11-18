import type { Suggestion, SuggestionKind } from './reading-rules';

export type DocumentType = 'cv' | 'identity' | 'matric' | 'diploma' | 'degree' | 'transcript' | 'supporting';
export type ReadingPage = { page: number; text: string; ocr: boolean };
export const documentLabels: Record<DocumentType, string> = {
  cv: 'CV', identity: 'Identity document', matric: 'Matric certificate', diploma: 'Diploma',
  degree: 'Degree', transcript: 'Academic transcript', supporting: 'Supporting document',
};
const qualificationPattern = /\b(?:national senior certificate|senior certificate|matric(?:ulation)?|grade 12|(?:national |advanced |higher |postgraduate )?diploma(?: in [\w &(),/-]+)?|(?:higher |national )?certificate in [\w &(),/-]+|(?:bachelor|master|doctor)(?: of|['’]s)? [\w &(),/-]+|(?:bsc|bcom|beng|ba|btech|msc|mba|phd)(?:\s+(?:in|of)\s+[\w &(),/-]+)?|degree in [\w &(),/-]+)\b/i;
const boilerplate = /\b(this (?:candidate|certificate|document)|hereby|awarded to|has been awarded|certify that|certifies that|in accordance|all rights reserved|(?:certificate|document) verification|verify (?:this|at)|document reference|certificate (?:number|no)|registration (?:number|no)|identity (?:number|no)|id (?:number|no)|issued under|signed on behalf|not transferable|legal notice|page \d+ of|copyright)\b/i;
const identity = /\b(identity (?:document|card)|identification card|smart id|republic of south africa[\s\S]{0,100}identity|passport|home affairs|change of address|I\.\s*D\.\s*No)\b/i;
const yearFrom = (s: string) => {
  const years = s.match(/\b(?:19|20)\d{2}\b/g);
  return years?.length === 1 ? years[0] : undefined;
};
const clean = (s: string) => s.trim().replace(/^[•●\-*.]\s*/, '').replace(/\s+/g, ' ');
const bulletLine = (s: string) => /^\s*[•●*.\-]\s*[A-Za-z]/.test(s);
// 13-digit SA ID numbers, also when OCR splits them with spaces or dashes.
const safeLine = (s: string) => s.replace(/\b\d(?:[ -]?\d){12}\b/g, '[identity number withheld]')
  .replace(/\b(?:I\.?\s*D\.?|identity|passport)\s*(?:number|no\.?)\s*[:#-]?\s*[\w -]*\d[\w -]*/gi, '[identity detail withheld]');
/** Fixes common, unambiguous OCR letter swaps (l/I) and split words. */
export function fixOcr(s: string) {
  return s.replace(/\bl(?=[A-Z]{1,3}\b)/g, 'I').replace(/\bln(?=[a-z]{3,})/g, 'In').replace(/\blwas\b/g, 'I was')
    .replace(/\bCertif\s+icate/gi, 'Certificate').replace(/\bJavaSript\b/gi, 'JavaScript').replace(/\bCaf6\b/g, 'Café')
    .replace(/\b(Physical|Life|Computer|Business|Social|Natural)(Sciences?|Studies)\b/g, '$1 $2');
}
function cvScore(text: string) {
  return [/\b(?:worked|working|developed|employed|assistant|manager|intern)\b/i, /\b(?:university|college|high\s+school|secondary\s+school)\b/i,
    /\b(?:diploma|certificate|degree)\b/i, /\b(?:javascript|java|python|html|css|sql|typing|microsoft|skills?)\b/i,
    /\b(?:hobbies|interests|singing|dancing|travelling|references)\b/i].filter(r => r.test(text)).length;
}
export function classifyPage(raw: string): DocumentType {
  const text = fixOcr(raw); const cv = cvScore(text);
  // Identity takes priority: never interpret security text on IDs as education.
  // Certificates often print the holder's ID number: they stay certificates (numbers are still withheld).
  const certificate = /\b(?:national senior certificate|senior certificate|diploma|degree|bachelor|academic record|statement of results|transcript)\b/i.test(text);
  if (identity.test(text) && cv < 3 && !certificate) return 'identity';
  if (/\b(?:academic (?:record|transcript|results)|transcript|statement of results)\b/i.test(text)) return 'transcript';
  if (/\b(?:curriculum vitae|resume|résumé|work experience|employment history|professional experience)\b/i.test(text) || /\beducation\b/i.test(text) && /\bskills\b/i.test(text)
    || cv >= 3 && !/\b(?:awarded to|having complied|hereby certif)/i.test(text)) return 'cv';
  if (/\b(?:national senior certificate|senior certificate|matric certificate)\b/i.test(text)) return 'matric';
  if (/\bdiploma\b/i.test(text)) return 'diploma';
  if (/\b(?:bachelor|master|doctor of|degree|bsc|bcom|beng|msc|phd)\b/i.test(text)) return 'degree';
  return 'supporting';
}
export function privatePageText(page: ReadingPage) {
  const type = classifyPage(page.text);
  return `Page ${page.page} — ${documentLabels[type]}\n${type === 'identity' ? '[Identity details withheld. Original document remains private.]' : fixOcr(page.text).split(/\r?\n/).map(safeLine).join('\n')}`;
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
    const raw = fixOcr(page.text).split(/\r?\n/).filter(s => s.trim() && s.length <= 2000);
    const bullets = new Set(raw.flatMap((l, i) => bulletLine(l) ? [i] : []));
    const lines = raw.map(clean).map(safeLine);
    let section = type === 'transcript' ? 'result' as const : type === 'cv' || type === 'supporting' ? carriedSection : undefined;
    const consumed = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || consumed.has(i)) continue;
      const nextHeading = heading(line);
      if (nextHeading) { section = nextHeading === 'ignore' ? undefined : nextHeading; continue; }
      if (boilerplate.test(line) || /\[identity|https?:|@/.test(line)) continue;
      // Matric certificate rows: subject, percentage and achievement level (1-7), with OCR edge noise removed.
      const matricRow = type === 'matric' ? line.replace(/^\S{1,2}\s+/, '').match(/^([A-Z][a-z]+(?: [A-Z][a-z]+){0,4})\s+(\d{1,3})\s+([1-7])\b/) : null;
      if (matricRow && Number(matricRow[2]) <= 100) {
        const data: Record<string, string> = { subject: matricRow[1] ?? '', grade: `${matricRow[2]}% (level ${matricRow[3]})` };
        const year = yearFrom(lines.filter(l => /with effect from|examination/i.test(l)).join(' ')); if (year) data['year'] = year;
        add('result', data, line, page); continue;
      }
      // Only explicit subject + mark, never arbitrary percentage sentences.
      const result = line.match(/^([A-Za-z][A-Za-z &()/-]{1,90}?)\s*[:|–-]?\s+(\d{1,3}(?:\.\d+)?\s*%|[A-F][+-]?)(?:\s+(\d{4}))?$/);
      if (result && !/^[A-Z ]+$/.test(result[1]?.trim() ?? '') && !/\b(?:is|was|are|rate|average|total|overall|minimum|achieved|obtained|passed)\b/i.test(result[1] ?? '') && (section === 'result' || type === 'transcript' || type === 'matric')) {
        const data: Record<string,string> = { subject: result[1]?.trim() ?? '', grade: result[2] ?? '' };
        const year = result[3] ?? yearFrom(lines.filter(l => /(?:completed|completion|year|examination)/i.test(l)).join(' '));
        if (year) data['year'] = year;
        const mark = data['grade'] ?? '';
        if (!mark.includes('%') || parseFloat(mark) <= 100) add('result', data, line, page);
        continue;
      }
      const qualification = line.match(qualificationPattern);
      if (qualification && !bullets.has(i) && line.split(/\s+/).length <= 12 && !/\b(?:admission|requirements|gazetted|minimum)\b/i.test(line) && !/^(?:subject|course|module)\s*:/i.test(line)) {
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
    if (type === 'cv') cvLayoutEntries(lines, bullets, page, add, out);
    carriedSection = type === 'cv' || type === 'supporting' ? section : undefined;
  }
  return out;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bOf\b/g, 'of');
const skillWords: [RegExp, string][] = [
  [/\bjava\s?script\b/i, 'JavaScript'], [/\bjava\b(?!\s?script)/i, 'Java'], [/\bpython\b/i, 'Python'], [/\bhtml\d?\b/i, 'HTML'],
  [/\bcss\d?\b/i, 'CSS'], [/\bphp\b/i, 'PHP'], [/\b(?:my)?sql\b/i, 'SQL'], [/\bc#/i, 'C#'], [/\bc\+\+/i, 'C++'], [/\breact\b/i, 'React'],
  [/\bgit(?:hub)?\b/i, 'Git'], [/\b(?:ms|microsoft) word\b/i, 'Microsoft Word'], [/\bexcel\b/i, 'Microsoft Excel'],
  [/\bpowerpoint\b/i, 'Microsoft PowerPoint'], [/\b(?:ms|microsoft) office\b/i, 'Microsoft Office'], [/\btyping\b/i, 'Typing'],
  [/\bscanning\b/i, 'Scanning'], [/\bphotocopying\b/i, 'Photocopying'], [/\blaminating\b/i, 'Laminating'],
  [/\bteam leader\b/i, 'Team leadership'], [/\bdeveloped\b[^.]{0,40}\bwebsites?\b/i, 'Website development'],
  [/\bsoftware development\b/i, 'Software development'],
];
type Add = (kind: SuggestionKind, data: Record<string, string>, source: string, page: ReadingPage) => void;
/** Designed CVs often have headings as images: read their content by line shape instead. */
function cvLayoutEntries(lines: string[], bullets: Set<number>, page: ReadingPage, add: Add, out: Suggestion[]) {
  const mine = out.filter(s => s.page === page.page);
  const upper = lines.filter(l => /^[A-Z][A-Z.&' -]+$/.test(l)).join(' ');
  const orgs = [...upper.matchAll(/\b[A-Z][A-Z'-]{2,} (?:UNIVERSITY OF [A-Z]+|UNIVERSITY|HIGH SCHOOL|SECONDARY SCHOOL|PRIMARY SCHOOL|COLLEGE|TECHNIKON|ACADEMY)\b/g)].map(m => titleCase(m[0]));
  const text = lines.join(' ');
  const hasMatric = /national senior certificate|\bmatric/i.test(text);
  for (const org of orgs) add('education', /school/i.test(org) && hasMatric ? { institution: org, level: 'Grade 12' } : { institution: org }, org, page);
  const universities = orgs.filter(o => /university|technikon|college|academy/i.test(o));
  const schools = orgs.filter(o => /school/i.test(o));
  for (const q of mine.filter(s => s.kind === 'qualification' && !s.data['issuer'])) {
    const t = q.data['title'] ?? '';
    if (/national senior certificate|matric/i.test(t) && schools.length === 1) q.data['issuer'] = schools[0]!;
    else if (/diploma|degree|bachelor|master/i.test(t) && universities.length === 1) q.data['issuer'] = universities[0]!;
  }
  const isTitle = (l: string) => /^[A-Z][A-Za-z()&'é/ -]{2,60}$/.test(l) && l.split(/\s+/).length <= 6 && !qualificationPattern.test(l) && !/^[A-Z .&'-]+$/.test(l);
  const roles = new Map<string, { data: Record<string, string>; source: string }>();
  let role: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!bullets.has(i)) { if (isTitle(line)) role = line; else if (qualificationPattern.test(line)) role = undefined; continue; }
    const block = [line];
    for (let j = i + 1; j < lines.length && !bullets.has(j) && !isTitle(lines[j] ?? '') && !qualificationPattern.test(lines[j] ?? ''); j++) block.push(lines[j] ?? '');
    const joined = block.join(' ');
    const special = joined.match(/\bspeciali[sz]ed\s+in\s+([A-Za-z ]{3,60}?)(?:[.,]|$)/i)?.[1]?.trim();
    if (special) {
      let k = i; while (k >= 0 && (bullets.has(k) || !qualificationPattern.test(lines[k] ?? ''))) k--;
      const title = lines[k]?.match(qualificationPattern)?.[0];
      const q = mine.find(s => s.kind === 'qualification' && title && s.data['title'] === title.replace(/\s*[,|–-]?\s*\b(?:19|20)\d{2}\b.*$/, '').trim());
      if (q) q.data['field'] = `${q.data['field'] ? `${q.data['field']} — ` : ''}${titleCase(special).replace(/^./, c => c.toUpperCase())} specialisation`;
      continue;
    }
    if (role && /\b(?:worked|working|employed|developed|interned)\b/i.test(joined)) {
      const entry = roles.get(role) ?? { data: { role }, source: role };
      const employer = joined.match(/\b(?:at|for)\s+([A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,3})/)?.[1]?.trim();
      if (employer && !entry.data['employer']) entry.data['employer'] = employer;
      const years = joined.match(/\b(?:19|20)\d{2}\b/g);
      if (years && !entry.data['period']) entry.data['period'] = years.join(' – ');
      if (/\bcurrently\b/i.test(joined) && !/present/i.test(entry.data['period'] ?? '')) entry.data['period'] = `${entry.data['period'] ? `${entry.data['period']} – ` : ''}present`;
      entry.source = `${entry.source}\n${joined}`.slice(0, 2000); roles.set(role, entry);
    }
  }
  for (const { data, source } of roles.values()) add('experience', data, source, page);
  // Matric subjects listed as bullets under the certificate (no marks on a CV).
  const nsc = lines.findIndex((l, i) => !bullets.has(i) && /national senior certificate/i.test(l));
  if (nsc >= 0) for (let i = nsc + 1; i < lines.length && bullets.has(i); i++) {
    const subject = lines[i] ?? '';
    if (/^[A-Za-z ]{3,40}$/.test(subject)) add('result', { subject }, `National Senior Certificate: ${subject}`, page);
  }
  // Only when the CV had no readable skills list, so explicit skills are never duplicated.
  if (!out.some(s => s.kind === 'skill')) for (const [pattern, name] of skillWords) { const m = text.match(pattern); if (m) add('skill', { name }, m[0], page); }
}
