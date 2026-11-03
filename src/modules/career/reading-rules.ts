export type SuggestionKind = 'education' | 'qualification' | 'result' | 'skill' | 'experience';
export type Suggestion = {
  kind: SuggestionKind; data: Record<string, string>; source: string;
  page: number; uncertain: boolean; status: 'pending' | 'accepted' | 'rejected';
};
export const readingFields: Record<SuggestionKind, { key: string; label: string }[]> = {
  education: [{ key: 'institution', label: 'School or institution' }, { key: 'level', label: 'Level' }, { key: 'field', label: 'Field of study' }, { key: 'year', label: 'Year completed' }],
  qualification: [{ key: 'title', label: 'Qualification' }, { key: 'issuer', label: 'Issued by' }, { key: 'field', label: 'Field of study' }, { key: 'year', label: 'Year' }],
  result: [{ key: 'subject', label: 'Subject' }, { key: 'grade', label: 'Mark or grade' }, { key: 'year', label: 'Year' }],
  skill: [{ key: 'name', label: 'Skill' }, { key: 'level', label: 'Level' }],
  experience: [{ key: 'role', label: 'Role or experience' }, { key: 'employer', label: 'Employer' }, { key: 'period', label: 'Dates' }],
};
export type ReadingErrorCode = 'unreadable' | 'encrypted' | 'oversized' | 'unsupported' | 'limit' | 'interrupted';
export class ReadingError extends Error {
  constructor(public code: ReadingErrorCode) { super(code); }
}
export const readingErrors: Record<ReadingErrorCode, string> = {
  unreadable: 'No readable text was found. Try a clearer copy or enter your information manually.',
  encrypted: 'This PDF is password-protected. Upload an unlocked copy.',
  oversized: 'Files must be 10 MB or smaller.',
  unsupported: 'Only PDF, JPG and PNG documents can be read.',
  limit: 'This document is too complex or long to read safely. Split it into smaller files (up to 20 pages).',
  interrupted: 'Reading was interrupted. Keep this page open and try again.',
};
export function validateReadingInput(size: number, mime: string) {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mime)) throw new ReadingError('unsupported');
  if (size > 10 * 1024 * 1024) throw new ReadingError('oversized');
  if (size <= 0) throw new ReadingError('unreadable');
}

/** Conservative line/section rules, not AI: retain verbatim candidates, never infer an issuer/date. */
export function suggestEntries(pages: { page: number; text: string; ocr: boolean }[]): Suggestion[] {
  const output: Suggestion[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    let section: SuggestionKind | undefined;
    for (const raw of page.text.split(/\r?\n/)) {
      const line = raw.trim().replace(/^[•●\-*]\s*/, '');
      if (!line || line.length > 2000) continue;
      const heading = line.replace(/:$/, '').toLowerCase();
      if (/^(education|academic background|education and training)$/.test(heading)) { section = 'education'; continue; }
      if (/^(qualifications|certifications|certificates)$/.test(heading)) { section = 'qualification'; continue; }
      if (/^(academic results|results|transcript)$/.test(heading)) { section = 'result'; continue; }
      if (/^(skills|technical skills|key skills|competencies)$/.test(heading)) { section = 'skill'; continue; }
      if (/^(employment history|work experience|professional experience|experience)$/.test(heading)) { section = 'experience'; continue; }
      if (/^(references|contact details|personal details|profile|summary|interests|languages)$/.test(heading)) { section = undefined; continue; }
      const grade = line.match(/\b\d{1,3}(?:\.\d+)?\s*%/);
      const qualification = /\b(bachelor|master|doctorate|diploma|certificate|degree|bsc|bcom|ba|msc|phd|matric|grade 12)\b/i.test(line);
      const kind: SuggestionKind | undefined = grade ? 'result' : qualification ? 'qualification' : section;
      if (!kind) continue;
      const key = `${kind}:${line.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const data: Record<string, string> = { [readingFields[kind][0]?.key ?? 'name']: line.slice(0, 200) };
      const year = line.match(/\b(?:19|20)\d{2}\b/g);
      // Only a unique explicitly stated year; dates are never guessed from neighbouring lines.
      if (year?.length === 1 && kind !== 'skill' && kind !== 'experience') data.year = year[0] ?? '';
      if (grade && kind === 'result') {
        data.grade = grade[0];
        data.subject = line.slice(0, grade.index).trim().replace(/[|:–-]+$/, '').trim().slice(0, 200) || line.slice(0, 200);
      }
      output.push({ kind, data, source: line, page: page.page, uncertain: true, status: 'pending' });
      if (output.length === 100) return output;
    }
  }
  return output;
}