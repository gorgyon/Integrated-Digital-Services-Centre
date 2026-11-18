/** Admission Point Score from National Senior Certificate marks (7-point achievement scale). */
export const levelFromPercent = (p: number) => p >= 80 ? 7 : p >= 70 ? 6 : p >= 60 ? 5 : p >= 50 ? 4 : p >= 40 ? 3 : p >= 30 ? 2 : 1;

export type ApsResult = { score: number; counted: { subject: string; level: number }[]; missing: string[] };

/** Best six subjects, Life Orientation excluded (the most common university rule). Subjects without a mark are listed as missing. */
export function apsScore(results: { subject?: string; grade?: string; qualification?: string }[]): ApsResult | undefined {
  const seen = new Map<string, { subject: string; level?: number }>();
  for (const r of results) {
    const subject = (r.subject ?? '').trim();
    if (!subject || r.qualification || /life orientation/i.test(subject)) continue;
    const percent = r.grade?.match(/(\d{1,3})\s*%/)?.[1];
    const level = percent && Number(percent) <= 100 ? levelFromPercent(Number(percent)) : Number(r.grade?.match(/level\s*([1-7])\b/i)?.[1]) || undefined;
    const key = subject.toLowerCase().split(/\s+/)[0] + (/home language/i.test(subject) ? ' hl' : /additional language/i.test(subject) ? ' fal' : '');
    const prior = [...seen.entries()].find(([k, v]) => k === key || v.subject.toLowerCase().startsWith(subject.toLowerCase() + ' ') || subject.toLowerCase().startsWith(v.subject.toLowerCase() + ' '));
    if (prior) { if (level && !prior[1].level) seen.set(prior[0], { subject: subject.length > prior[1].subject.length ? subject : prior[1].subject, level }); continue; }
    seen.set(key, level ? { subject, level } : { subject });
  }
  const all = [...seen.values()];
  const counted = all.filter((s): s is { subject: string; level: number } => !!s.level).sort((a, b) => b.level - a.level).slice(0, 6);
  if (!counted.length) return undefined;
  return { score: counted.reduce((n, s) => n + s.level, 0), counted, missing: all.filter(s => !s.level).map(s => s.subject) };
}
