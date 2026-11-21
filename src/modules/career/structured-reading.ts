import type { Suggestion, SuggestionKind } from './reading-rules';

export type DocumentType = 'cv' | 'identity' | 'matric' | 'diploma' | 'degree' | 'transcript' | 'supporting';
export type ReadingPage = { page: number; text: string; ocr: boolean; layoutText?: string };
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
const safeLine = (s: string) => (/\b[iIlT1][dco]\w{2,5}[il1t]y\b/i.test(s) && /\d{5,}/.test(s) ? '[identity detail withheld]' : s)
  // Long digit runs (even with OCR letter swaps) are never kept: they may be ID numbers.
  .replace(/\b(?=[\dA-Z%]*\d[\dA-Z%]*\d)(?:[\dOIlSYZB%]*\d){9,}[\dOIlSYZB%]*\b/g, '[number withheld]')
  .replace(/\b\d(?:[ -]?\d){12}\b/g, '[identity number withheld]')
  .replace(/\b(?:I\.?\s*D\.?|identity|passport)\s*(?:number|no\.?)\s*[:#-]?\s*[\w -]*\d[\w -]*/gi, '[identity detail withheld]');
/** Fixes common, unambiguous OCR letter swaps (l/I) and split words. */
export function fixOcr(s: string) {
  return s.replace(/\bl(?=[A-Z]{1,3}\b)/g, 'I').replace(/\bln(?=[a-z]{3,})/g, 'In').replace(/\blwas\b/g, 'I was')
    .replace(/\bCertif\s+icate/gi, 'Certificate').replace(/\bJavaSript\b/gi, 'JavaScript').replace(/\bCaf6\b/g, 'Café')
    .replace(/\bf\s+rom\b/gi, 'from').replace(/\bd\s+iff\s+erent\b/gi, 'different').replace(/\bv\s+irtual\s+ly\b/gi, 'virtually')
    .replace(/\binteruiews\b/gi, 'interviews').replace(/\bAbliity to lear fast and adapt\b/gi, 'Ability to learn fast and adapt')
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
  if (/\b(?:academic (?:record|transcript|results)|transcript|statement of results)\b/i.test(text) || /\bacademic\s+tra[a-z]{4,8}\b/i.test(text)) return 'transcript';
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
  if (/^(education|academic background|educational background|education and training|education & training|academic qualifications|academic history|schooling|tertiary education)$/.test(h)) return 'education';
  if (/^(qualifications|certifications|certificates|courses|training|licen[cs]es(?: and certifications)?|professional qualifications)$/.test(h)) return 'qualification';
  if (/^(academic results|results|transcript|subjects|subject results|matric results)$/.test(h)) return 'result';
  if (/^(sk[il1]{2,3}l?s|technical skills|key skills|core skills|soft skills|computer skills|skills (?:and|&) abilities|skills (?:and|&) competencies|abilities|competencies|core competencies|strengths|expertise)$/.test(h)) return 'skill';
  if (/^(employment history|employment|work experience|work history|career history|professional experience|relevant experience|experience|internships?|volunteer(?:ing)? experience|work)$/.test(h)) return 'experience';
  if (/^(references?|referees?|contact|contact details|contact information|personal details|personal information|personal profile|profile|professional profile|summary|professional summary|career summary|about me|about|objective|career objective|personal statement|interests|hobbies|hobbies and interests|languages|declaration|achievements|awards)$/.test(h)) return 'ignore';
  return undefined;
}
const organisation = (s: string) => /\b(university|college|school|institute|academy|technikon)\b/i.test(s) && !boilerplate.test(s);
function labelled(lines: string[], pattern: RegExp): string | undefined {
  for (const line of lines) { const match = line.match(pattern); if (match?.[1]) return match[1].trim().slice(0, 200); }
  return undefined;
}
export function structuredSuggestions(pages: ReadingPage[], unclear: Set<number> = new Set()): Suggestion[] {
  const out: Suggestion[] = [];
  let carriedSection: SuggestionKind | undefined;
  const add = (kind: SuggestionKind, data: Record<string, string>, source: string, page: ReadingPage) => {
    if (!Object.values(data).some(Boolean) || out.length >= 100) return;
    const key = kind === 'qualification' ? 'title' : kind === 'education' ? 'institution' : kind === 'result' ? 'subject' : kind === 'skill' ? 'name' : kind === 'personal' ? 'full_name' : 'role';
    const normalize = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const qualifiers = kind === 'qualification' ? ['issuer','field','year'] : kind === 'education' ? ['level','field','year'] : kind === 'result' ? ['grade','year'] : kind === 'experience' ? ['employer','period'] : [];
    // Results: "English" on a CV and "English First Additional Language" on the certificate are the same subject.
    const same = (a: string, b: string) => a === b || kind === 'result' && !!a && !!b && (a.startsWith(`${b} `) || b.startsWith(`${a} `));
    const priorIndex = out.findIndex(s => s.kind === kind && (kind === 'personal' || same(normalize(s.data[key]), normalize(data[key]))) && qualifiers.every(k => !s.data[k] || !data[k] || normalize(s.data[k]) === normalize(data[k])));
    const prior = out[priorIndex];
    if (prior) {
      // Never two entries for one fact: keep whichever states more, and fill gaps for personal details.
      if (kind === 'personal') { for (const [k, v] of Object.entries(data)) if (v && !prior.data[k]) prior.data[k] = v; return; }
      const filled = (d: Record<string, string>) => Object.values(d).filter(Boolean).length + (d[key]?.length ?? 0) / 1000;
      if (filled(data) <= filled(prior.data)) return;
    }
    const entry: Suggestion = { kind, data, source: safeLine(source).slice(0, 2000), page: page.page, uncertain: true, status: 'pending', documentType: classifyPage(page.text) };
    if (prior) out[priorIndex] = entry; else out.push(entry);
  };
  for (const page of pages) {
    const type = classifyPage(page.text);
    if (type === 'identity') { carriedSection = undefined; continue; }
    if (type === 'transcript') transcriptRows(page, add, out, unclear.has(page.page));
    if (unclear.has(page.page)) { carriedSection = undefined; continue; }
    const raw = fixOcr(page.text).split(/\r?\n/).filter(s => s.trim() && s.length <= 2000);
    const bullets = new Set(raw.flatMap((l, i) => bulletLine(l) ? [i] : []));
    const lines = raw.map(clean).map(safeLine);
    let section = type === 'transcript' ? 'result' as const : type === 'cv' || type === 'supporting' ? carriedSection : undefined;
    const consumed = new Set<number>();
    let last: Suggestion | undefined;
    const latest = (kind: SuggestionKind) => { const found = [...out].reverse().find(s => s.page === page.page && s.kind === kind); last = found; };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || consumed.has(i)) continue;
      const nextHeading = heading(line);
      if (nextHeading) { section = nextHeading === 'ignore' ? undefined : nextHeading; last = undefined; continue; }
      if (boilerplate.test(line) || /\[identity|https?:|@/.test(line)) continue;
      // Sentences and bullets are kept exactly as the applicant wrote them, under the job or course above them.
      const sentence = bullets.has(i) || /[.!?]$/.test(line) || line.length > 180;
      if (sentence && last && (section === 'experience' || section === 'education' || section === 'qualification') && !(!bullets.has(i) && line.split(/\s+/).length <= 12 && qualificationPattern.test(line))) {
        const key = last.kind === 'experience' ? 'duties' : 'details';
        const list = (last.data[key] ?? '').split('\n').filter(Boolean);
        if (!list.includes(line)) list.push(line);
        last.data[key] = list.join('\n').slice(0, 2400); last.source = `${last.source}\n${line}`.slice(0, 2000);
        continue;
      }
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
        add('qualification', data, block.join('\n'), page); latest('qualification');
        continue;
      }
      if (section === 'education' && organisation(line)) {
        const data: Record<string,string> = { institution: line.slice(0,200) };
        const next = lines[i + 1];
        if (next && /^grade\s+(?:[1-9]|1[01])\b/i.test(next)) { data['level'] = next.replace(/\s*[,|–-]?\s*\b(?:19|20)\d{2}\b.*$/, ''); const year = yearFrom(next); if (year) data['year'] = year; consumed.add(i + 1); }
        add('education', data, next && data['level'] ? `${line}\n${next}` : line, page); latest('education');
      } else if (section === 'skill' && line.length <= 160 && !/[.!?]$/.test(line)) {
        for (const part of line.split(/[,;|•]/)) { const name = part.trim(); if (name.length >= 2 && name.length <= 80 && !/^\d+$/.test(name) && name.split(' ').length <= 8) add('skill', { name }, name, page); }
      } else if (section === 'experience' && !sentence && !/^\d/.test(line)) {
        const match = line.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[|,]\s*((?:19|20)\d{2}.*))?$/i);
        const data: Record<string,string> = { role: (match?.[1] ?? line).slice(0,200) };
        if (match?.[2]) data['employer'] = match[2];
        if (match?.[3]) data['period'] = match[3];
        const next = lines[i + 1];
        if (next && /^(?:dates|period|employer)\s*:/i.test(next)) {
          const employer = labelled([next], /^employer\s*:\s*(.+)$/i); const period = labelled([next], /^(?:dates|period)\s*:\s*(.+)$/i);
          if (employer) data['employer'] = employer; if (period) data['period'] = period; consumed.add(i + 1);
        }
        add('experience', data, line, page); latest('experience');
      }
    }
    if (type === 'cv') {
      const personal = personalDetails(page.layoutText ? `${page.text}\n${page.layoutText}` : page.text);
      if (personal['full_name'] || personal['email'] || personal['phone']) add('personal', personal, Object.values(personal).join(' · '), page);
      cvLayoutEntries(lines, bullets, page, add, out);
      if (page.layoutText) layoutFacts(page.layoutText, out.filter(s => s.page === page.page));
      if (page.layoutText) for (const name of layoutSkills(page.layoutText)) add('skill', { name }, name, page);
      // A skill written on its own and the same skill inside a longer list item are one skill.
      dropSkillFragments(out);
    }
    carriedSection = type === 'cv' || type === 'supporting' ? section : undefined;
  }
  return combineEducation(out);
}

/** A qualification and its institution are one Education record, never two competing cards. */
function combineEducation(entries: Suggestion[]): Suggestion[] {
  const combined: Suggestion[] = [];
  const schoolLevel = (s: string) => /grade\s*12|national senior certificate|\bmatric/i.test(s);
  for (const original of entries) {
    if (original.kind !== 'education' && original.kind !== 'qualification') { combined.push(original); continue; }
    const qualification = original.kind === 'qualification';
    const data: Record<string, string> = qualification ? {
      institution: original.data['issuer'] ?? '', level: original.data['title'] ?? '',
      ...(original.data['field'] ? { field: original.data['field'] } : {}),
      ...(original.data['year'] ? { year: original.data['year'] } : {}),
      ...(original.data['details'] ? { details: original.data['details'] } : {}),
    } : { ...original.data };
    const institution = normalize(data['institution']); const level = normalize(data['level']);
    const prior = combined.find(s => {
      if (s.kind !== 'education') return false;
      const otherInstitution = normalize(s.data['institution']); const otherLevel = normalize(s.data['level']);
      const institutionMatch = !!institution && institution === otherInstitution;
      const levelMatch = !!level && level === otherLevel;
      if (!institutionMatch && !levelMatch) return false;
      if (institution && otherInstitution && institution !== otherInstitution) return false;
      if (level && otherLevel && level !== otherLevel && !(schoolLevel(level) && schoolLevel(otherLevel))) return false;
      return ['field', 'year'].every(k => !data[k] || !s.data[k] || normalize(data[k]) === normalize(s.data[k]));
    });
    if (!prior) {
      combined.push({ ...original, kind: 'education', data, source: original.source });
      continue;
    }
    const priorLevel = prior.data['level'] ?? '';
    const preferredLevel = qualification && (schoolLevel(data['level'] ?? '') || !priorLevel) ? data['level'] : priorLevel || data['level'];
    prior.data = {
      institution: prior.data['institution'] || data['institution'] || '',
      ...(preferredLevel ? { level: preferredLevel } : {}),
      ...(['field', 'year'] as const).reduce<Record<string, string>>((acc, k) => {
        const value = prior.data[k] || data[k]; if (value) acc[k] = value; return acc;
      }, {}),
      ...(() => {
        const lines = [...new Set([...(prior.data['details'] ?? '').split('\n'), ...(data['details'] ?? '').split('\n')].filter(Boolean))];
        return lines.length ? { details: lines.join('\n').slice(0, 2400) } : {};
      })(),
    };
    if (!prior.source.includes(original.source)) prior.source = `${prior.source}\n${original.source}`.slice(0, 2000);
  }
  return combined;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bOf\b/g, 'of');
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
  const isTitle = (l: string) => /^[A-Z][A-Za-z()&'é/ -]{2,60}$/.test(l) && l.split(/\s+/).length <= 6 && !qualificationPattern.test(l) && !/^[A-Z .&'-]+$/.test(l) && !heading(l);
  const capsLabel = (l: string) => /^[A-Z][A-Z .&'-]*$/.test(l);
  const roles = new Map<string, { data: Record<string, string>; source: string }>();
  let role: string | undefined; let course: string | undefined; let jobsAllowed = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const h = heading(line);
    if (h) { role = undefined; course = undefined; jobsAllowed = h === 'experience'; continue; }
    if (!bullets.has(i)) {
      if (qualificationPattern.test(line) && line.split(/\s+/).length <= 12) { role = undefined; course = line.match(qualificationPattern)?.[0].replace(/\s*[,|–-]?\s*\b(?:19|20)\d{2}\b.*$/, '').trim(); }
      else if (isTitle(line) && jobsAllowed) { role = line; course = undefined; }
      continue;
    }
    const block = [line];
    // Wrapped lines continue the bullet; side-column labels in capitals (school or employer names) do not.
    for (let j = i + 1; j < lines.length && !bullets.has(j) && !isTitle(lines[j] ?? '') && !qualificationPattern.test(lines[j] ?? '') && !heading(lines[j] ?? ''); j++) if (!capsLabel(lines[j] ?? '')) block.push(lines[j] ?? '');
    const joined = block.join(' ');
    if (course && !role) {
      const q = mine.find(s => (s.kind === 'qualification' && s.data['title'] === course) || (s.kind === 'education' && s.data['level'] === course));
      if (q) { const list = (q.data['details'] ?? '').split('\n').filter(Boolean); if (!list.includes(joined)) list.push(joined); q.data['details'] = list.join('\n').slice(0, 2400); }
    }
    const special = joined.match(/\bspeciali[sz]ed\s+in\s+([A-Za-z ]{3,60}?)(?:[.,]|$)/i)?.[1]?.trim();
    if (special) {
      let k = i; while (k >= 0 && (bullets.has(k) || !qualificationPattern.test(lines[k] ?? ''))) k--;
      const title = lines[k]?.match(qualificationPattern)?.[0];
      const q = mine.find(s => s.kind === 'qualification' && title && s.data['title'] === title.replace(/\s*[,|–-]?\s*\b(?:19|20)\d{2}\b.*$/, '').trim());
      if (q) q.data['field'] = `${q.data['field'] ? `${q.data['field']} — ` : ''}${titleCase(special).replace(/^./, c => c.toUpperCase())} specialisation`;
      continue;
    }
    if (role) {
      const entry = roles.get(role) ?? { data: { role }, source: role };
      // Every bullet belonging to the role is evidence, not only bullets containing "worked" or "developed".
      const duties = (entry.data['duties'] ?? '').split('\n').filter(Boolean);
      if (!duties.includes(joined)) duties.push(joined);
      entry.data['duties'] = duties.join('\n').slice(0, 2400);
      const employer = joined.match(/\b(?:at|for)\s+([A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,3})/)?.[1]?.trim();
      if (employer && !entry.data['employer']) entry.data['employer'] = employer;
      const years = joined.match(/\b(?:19|20)\d{2}\b/g);
      if (years && !entry.data['period']) entry.data['period'] = years.join(' – ');
      if (/\bcurrently\b/i.test(joined) && !/present/i.test(entry.data['period'] ?? '')) entry.data['period'] = `${entry.data['period'] ? `${entry.data['period']} – ` : ''}Present`;
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
  // Skills are never guessed from duties: only a written skills list becomes skills.
}
function dropSkillFragments(out: Suggestion[]) {
  const names = out.filter(s => s.kind === 'skill').map(s => normalize(s.data['name']));
  for (let i = out.length - 1; i >= 0; i--) {
    const s = out[i]!; if (s.kind !== 'skill') continue;
    const n = normalize(s.data['name']);
    if (names.some(o => o !== n && o.length > n.length && ` ${o} `.includes(` ${n} `) && /,/.test(out.find(x => x.kind === 'skill' && normalize(x.data['name']) === o)?.data['name'] ?? ''))) out.splice(i, 1);
  }
}

const hobbyWords = /\b(?:singing|dancing|travel(?:l)?ing|reading|music|sports?|soccer|netball|cooking|gaming|hiking|swimming|writing|drawing|photography|gardening|fashion|movies)\b/gi;
/** OCR confuses l, I and 1 in emails: when the read email matches the applicant's own sign-in email apart from those, use the sign-in email. */
export function correctOcrEmail<T extends { kind: string; data: Record<string, string> }>(suggestions: T[], accountEmail: string | undefined): T[] {
  if (!accountEmail) return suggestions;
  const shape = (e: string) => e.toLowerCase().replace(/[il1|]/g, 'l');
  for (const s of suggestions) {
    const read = s.data['email'];
    if (s.kind === 'personal' && read && read.toLowerCase() !== accountEmail.toLowerCase() && shape(read) === shape(accountEmail)) s.data['email'] = accountEmail.toLowerCase();
  }
  return suggestions;
}
/** Name, contact details, languages and interests from a CV page. Identity numbers are never included. */
export function personalDetails(raw: string): Record<string, string> {
  const lines = fixOcr(raw).split(/\r?\n/).map(clean).filter(Boolean);
  const data: Record<string, string> = {};
  const name = lines.slice(0, 6).find(l => /^[A-Z][A-Za-z'-]+(?: [A-Z][A-Za-z'-]+){1,3}$/.test(l) && !/\b(?:curriculum|vitae|resume|university|school|college|solutions|technology|self|employed)\b/i.test(l));
  if (name) data['full_name'] = titleCase(name);
  // Job title: printed straight under the name ("SOFTWARE DEVELOPER"), or labelled.
  const headline = labelled(lines, /^(?:job title|position|current position|title|profession|occupation)\s*:\s*(.+)$/i)
    ?? (name ? lines.flatMap((l, i) => normalize(l) === normalize(name) ? [lines[i + 1] ?? ''] : [])
      .find(l => /^[A-Za-z][A-Za-z&/,' -]{2,60}$/.test(l) && l.split(/\s+/).length <= 6 && !heading(l) && !organisation(l) && !/\b(?:curriculum|vitae|resume)\b/i.test(l)) : undefined);
  if (headline) data['headline'] = /^[^a-z]+$/.test(headline) ? titleCase(headline) : headline;
  const text = lines.join('\n');
  // Email addresses are lower case: a capital I in one is OCR for l.
  const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/); if (email) data['email'] = email[0].replace(/I/g, 'l').toLowerCase();
  // A referee's number is not the applicant's: skip phones in the few lines after a References heading.
  const refAt = lines.findIndex(l => /^references?\b/i.test(l));
  for (const [i, l] of lines.entries()) {
    if (refAt >= 0 && i > refAt && i <= refAt + 4) continue;
    const phone = l.match(/(?:\+27|\b0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/);
    if (phone) { const digits = phone[0].replace(/\D/g, ''); data['phone'] = /^0\d{9}$/.test(digits) ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : phone[0].replace(/\s+/g, ' '); break; }
  }
  let location = labelled(lines, /^(?:address|residential address|location|city|town)\s*:\s*(.+)$/i);
  if (!location) {
    const at = lines.findIndex(l => /(?:^|\s)\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3},?\s*$/.test(l));
    if (at >= 0) {
      const street = lines[at]!.match(/\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}/)![0];
      const town = lines[at + 1]?.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\.?$/)?.[1];
      location = town ? `${street}, ${town}` : street;
    }
  }
  if (location) data['location'] = location;
  const about = lines.findIndex(l => /^(?:about me|about|profile|summary|personal profile|professional profile|professional summary|career summary|career profile|personal statement|career objective|objective)\s*:?$/i.test(l));
  if (about >= 0) {
    const body: string[] = [];
    for (let i = about + 1; i < lines.length && body.length < 10; i++) { const l = lines[i]!; if (/^[A-Z][A-Z ]{3,}$/.test(l)) break; body.push(l); }
    if (body.join(' ').length > 20) data['objective'] = body.join(' ').slice(0, 1000);
  }
  const languages = labelled(lines, /^languages?(?: spoken)?\s*:\s*(.+)$/i); if (languages) data['languages'] = languages;
  const hobbies = lines.find(l => (l.match(hobbyWords)?.length ?? 0) >= 2) ?? labelled(lines, /^(?:hobbies|interests)\s*:\s*(.+)$/i);
  if (hobbies) data['interests'] = hobbies.replace(/^(?:hobbies|interests)\s*:\s*/i, '');
  for (const k of Object.keys(data)) if (k !== 'phone' && k !== 'email') data[k] = safeLine(data[k] ?? '');
  return data;
}

const moduleWords = ['FOUNDATION','ACADEMIC','LANGUAGE','SKILLS','MATHEMATICAL','INFORMATION','SOFTWARE','DEVELOPMENT','PRESENTATION','REPORTING','COMPUTING','FUNDAMENTALS','SYSTEMS','SYSTEM','TECHNICAL','PROGRAMMING','AND','FOR','IN','DESIGN','DATABASE','NETWORK','NETWORKS','BUSINESS','ANALYSIS','PROJECT','MANAGEMENT','ENGINEERING','COMMUNICATION','PRACTICE','WEB','APPLICATIONS','INTERNET','MOBILE','SECURITY','STATISTICS','ACCOUNTING','ECONOMICS','LIFE','PRINCIPLES','INTRODUCTION','EXPERIENTIAL','LEARNING','ETHICS','RESEARCH'];
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let prev = row[0]!; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = row[j]!; row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return row[b.length]!;
}
/** Corrects an OCR-damaged word to the closest known module word, or undefined when none is close. */
function moduleWord(raw: string) {
  const w = raw.toUpperCase().replace(/[^A-Z]/g, ''); if (w.length < 2) return undefined;
  let best: string | undefined; let score = Infinity;
  for (const m of moduleWords) { const d = distance(w, m); if (d < score) { score = d; best = m; } }
  return score <= (w.length <= 3 ? 0 : w.length <= 5 ? 1 : 2) ? best : undefined;
}
const titleWords = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(And|For|In|Of)\b/g, w => w.toLowerCase());
/** Transcript rows: module name, optional code, mark and result. Damaged words are corrected only to known module words. */
function transcriptRows(page: ReadingPage, add: Add, out: Suggestion[], unclearScan: boolean) {
  const qualification = out.find(s => s.kind === 'qualification' && /diploma|degree|bachelor/i.test(s.data['title'] ?? ''))?.data['title'];
  let year: string | undefined;
  for (const raw of fixOcr(page.text).split(/\r?\n/)) {
    const line = safeLine(raw.trim());
    const y = line.match(/^\W*(?:year|[ftdy]ea[rs])\b\W*((?:19|20)\d{2})/i)?.[1]; if (y) { year = y; continue; }
    const result = /\b(?:p|f|d|b)?a[s5][s5e]\b|\bpa[sy][s5e]?\b|\b[fp]ass\b|\bmss\b/i.test(line) ? 'Pass' : /\b[fp]ail\b/i.test(line) ? 'Fail' : undefined;
    const distinction = /\b[dbg][il1]?[s5]?t[il1]?n?c?t?[il1]?[o0]n\b|\bd[il1t]s?t[il1]nct|\bdist|\bdtst|bistenct/i.test(line);
    const tokens = line.split(/\s+/);
    const words: string[] = []; let i = 0;
    for (; i < tokens.length && words.length < 8; i++) { const w = moduleWord(tokens[i] ?? ''); if (w) words.push(w); else if (words.length) break; }
    if (words.filter(w => w.length > 3).length < 2 || words.every(w => ['INFORMATION','TECHNOLOGY','SYSTEMS'].includes(w)) && !result) continue;
    const code = tokens[i]?.match(/^[1IilT]{1,3}[AB8ab]?$/) ? tokens[i]!.toUpperCase().replace(/[1LT]/g, 'I').replace(/8/g, 'B') : undefined;
    // The mark is the number straight after the module (and its code); stray numbers elsewhere are ignored.
    const mark = tokens[code ? i + 1 : i]?.match(/^(\d{2,3})$/)?.[1];
    const outcome = result ?? (distinction ? 'Pass' : undefined);
    if (!outcome && !mark) continue;
    const data: Record<string, string> = { subject: titleWords(words.join(' ')) + (code ? ` ${code}` : '') };
    const grade = [mark && Number(mark) <= 100 ? `${mark}%` : '', outcome ? (distinction && outcome === 'Pass' ? 'Pass with distinction' : outcome) : ''].filter(Boolean).join(' — ');
    if (grade) data['grade'] = grade;
    if (year) data['year'] = year;
    if (qualification) data['qualification'] = qualification;
    add('result', data, `${unclearScan ? 'Unclear scan — check this row against the page. ' : ''}${line}`, page);
  }
}

const normalize = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
/** A month and/or year at the start of a line ("Aprit 2024 —", "2017-Present"), as printed in a CV's side column. */
function datePiece(line: string) {
  const range = line.match(/^\W*((?:19|20)\d{2})\s*[-–]\s*(present|current|now|(?:19|20)\d{2})\b/i);
  if (range) return `${range[1]} – ${/^\d/.test(range[2]!) ? range[2] : 'Present'}`;
  const m = line.match(/^\W*([A-Za-z]{3,9})\b\.?\s*((?:19|20)\d{2})?\b/);
  if (!m) return /^\W*((?:19|20)\d{2})\b/.exec(line)?.[1];
  const idx = months.indexOf(m[1]!.slice(0, 3).toLowerCase());
  if (idx < 0 || distance(m[1]!.toLowerCase(), monthNames[idx]!.toLowerCase().slice(0, m[1]!.length)) > 1) return undefined;
  return m[2] ? `${monthNames[idx]} ${m[2]}` : monthNames[idx];
}
/** Fills years and dates that designed CVs print in pale side columns, using the image reading of the page. Fills gaps only. */
export function layoutFacts(layoutText: string, mine: Suggestion[]) {
  const lines = fixOcr(layoutText).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const first = (l: string) => l.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  for (const edu of mine.filter(s => s.kind === 'education' && !s.data['year'])) {
    const last = (edu.data['institution'] ?? '').split(/\s+/).pop()?.toLowerCase() ?? '';
    const at = lines.findIndex(l => last.length > 3 && distance(first(l), last) <= 1);
    if (at < 0) continue;
    const year = lines.slice(at + 1, at + 4).map(l => l.match(/^\W*((?:19|20)\d{2})\b/)?.[1]).find(Boolean);
    if (!year) continue;
    edu.data['year'] = year;
    for (const q of mine.filter(s => s.kind === 'qualification' && !s.data['year'] && normalize(s.data['issuer']) === normalize(edu.data['institution']))) q.data['year'] = year;
  }
  for (const job of mine.filter(s => s.kind === 'experience')) {
    const role = normalize(job.data['role']);
    const at = lines.findIndex(l => role.length > 4 && normalize(l).includes(role));
    if (at < 0) continue;
    const pieces: string[] = [];
    const after = lines.slice(at + 1, at + 7);
    for (const l of after) { const p = datePiece(l); if (p) pieces.push(p); if (pieces.length === 2 || /present/i.test(p ?? '')) break; }
    // The town printed above the dates in the side column ("Polokwane", "Sandton").
    const dateAt = after.findIndex(l => datePiece(l));
    const town = dateAt > 0 ? after[dateAt - 1]!.split('|')[0]!.trim().split(/\s+/)[0]?.replace(/[.,]$/, '') : undefined;
    if (town && !job.data['location'] && /^[A-Z][a-z]{3,}$/.test(town) && !/(?:ed|ing|ly)$/.test(town) && !datePiece(town) && !/^(?:Solutions|Company|Limited|Holdings|Group|Services|Which|While|During|Currently|The|And)$/.test(town)) job.data['location'] = town;
    // "February" + "2017 – Present" -> "February 2017 – Present"
    let period = pieces.join(' – ').replace(/^([A-Z][a-z]+) – ((?:19|20)\d{2}) – /, '$1 $2 – ').replace(/^([A-Z][a-z]+) – ((?:19|20)\d{2})/, '$1 $2');
    if (/\d{4}/.test(period) && period.length > (job.data['period'] ?? '').length) job.data['period'] = period;
  }
}

/** Skills listed with arrow bullets under a Skills heading (OCR may read the heading as "SKIILS"), in one or two columns. */
export function layoutSkills(layoutText: string): string[] {
  const lines = fixOcr(layoutText).split(/\r?\n/).map(l => l.trim());
  const at = lines.findIndex(l => /^sk[il1]{2,3}l?s\b/i.test(l) && l.length < 20);
  if (at < 0) return [];
  const found: string[] = [];
  let open: number | undefined;
  for (const line of lines.slice(at + 1, at + 20)) {
    if (/^[A-Z]{4,}\b/.test(line) && !/[>»➢•]/.test(line)) break;
    const continuing = open; open = undefined;
    const arrowFirst = /^[>»➢•*-]/.test(line);
    line.split(/\s*[>»➢•]\s*/).forEach((segment, idx) => {
      const raw = segment.replace(/^[:.\s]+|\s+$/g, ''); if (!raw) return;
      const part = raw.replace(/,+$/, '').trim().replace(/\bJavaSript\b/, 'JavaScript');
      // A line that continues the previous bullet ("JavaSript" after "PHP, HTML, CSS, SQL,") joins it, as written.
      if (idx === 0 && !arrowFirst && continuing !== undefined) { found[continuing] = `${found[continuing]}, ${part}`; if (raw.endsWith(',')) open = continuing; return; }
      if (/^[A-Za-z][A-Za-z ,/#+.&()-]{1,80}$/.test(part) && !found.some(f => f.toLowerCase() === part.toLowerCase())) { found.push(part); if (raw.endsWith(',')) open = found.length - 1; }
    });
  }
  return found.slice(0, 30);
}
