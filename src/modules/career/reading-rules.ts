import { structuredSuggestions } from './structured-reading';
export type SuggestionKind = 'education' | 'qualification' | 'result' | 'skill' | 'experience' | 'personal';
export type Suggestion = {
  documentType?: import('./structured-reading').DocumentType;
  kind: SuggestionKind; data: Record<string, string>; source: string;
  page: number; uncertain: boolean; status: 'pending' | 'accepted' | 'rejected';
};
export const readingFields: Record<SuggestionKind, { key: string; label: string }[]> = {
  education: [{ key: 'level', label: 'Qualification or level' }, { key: 'institution', label: 'School or institution' }, { key: 'field', label: 'Field of study' }, { key: 'year', label: 'Year completed' }, { key: 'details', label: 'What you wrote about it' }],
  qualification: [{ key: 'title', label: 'Qualification' }, { key: 'issuer', label: 'Issued by' }, { key: 'field', label: 'Field of study' }, { key: 'year', label: 'Year' }, { key: 'details', label: 'What you wrote about it' }],
  result: [{ key: 'subject', label: 'Subject or module' }, { key: 'grade', label: 'Mark or grade' }, { key: 'year', label: 'Year' }, { key: 'qualification', label: 'Part of qualification' }],
  skill: [{ key: 'name', label: 'Skill' }, { key: 'level', label: 'Level' }],
  personal: [{ key: 'full_name', label: 'Full name' }, { key: 'headline', label: 'Job title' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'location', label: 'Location or address' }, { key: 'languages', label: 'Languages' }, { key: 'interests', label: 'Interests and hobbies' }, { key: 'objective', label: 'Career objective' }],
  experience: [{ key: 'role', label: 'Role or experience' }, { key: 'employer', label: 'Employer' }, { key: 'location', label: 'Location' }, { key: 'period', label: 'Dates' }, { key: 'duties', label: 'Duties and achievements' }],
};
export type ReadingErrorCode = 'unreadable' | 'encrypted' | 'oversized' | 'unsupported' | 'limit' | 'interrupted';
export class ReadingError extends Error {
  constructor(public code: ReadingErrorCode) { super(code); }
}
export const kindLabels: Record<SuggestionKind, string> = {
  personal: 'Personal and contact details', education: 'Education', qualification: 'Qualification', result: 'Academic result', skill: 'Skill', experience: 'Work experience',
};
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

/** Conservative structured parsing; no AI or inferred missing facts. */
export const suggestEntries = structuredSuggestions;
