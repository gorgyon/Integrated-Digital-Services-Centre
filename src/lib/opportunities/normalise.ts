/** Pure, runtime-neutral helpers for collected opportunities. Never fills gaps. */
export type OpportunityCategory =
  | "job" | "bursary" | "scholarship" | "internship" | "learnership" | "apprenticeship" | "grant" | "other";

/** What a source adapter produced: only fields actually present at the source. */
export interface RawItem {
  externalId?: string | null;
  title?: string | null;
  description?: string | null;
  link?: string | null;
  applicationUrl?: string | null;
  provider?: string | null;
  location?: string | null;
  category?: string | null;
  eligibility?: string | null;
  requirements?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
}

export interface NormalisedOpportunity {
  external_id: string;
  title: string;
  description: string | null;
  category: OpportunityCategory | null;
  provider_name: string | null;
  eligibility_criteria: string | null;
  location: string | null;
  application_requirements: string | null;
  opens_at: string | null;
  closes_at: string | null;
  source_url: string;
  application_url: string | null;
  dedupe_key: string;
  content_hash: string;
}

const CATEGORIES: OpportunityCategory[] = ["job", "bursary", "scholarship", "internship", "learnership", "apprenticeship", "grant", "other"];

const clean = (v?: string | null) => {
  const s = (v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return s ? s : null;
};

export function normaliseUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Only explicit dates are accepted; anything unparseable stays empty. */
export function toIsoDate(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Category only when the source states a recognisable one, else the source default. */
export function mapCategory(v: string | null | undefined, fallback: OpportunityCategory | null): OpportunityCategory | null {
  const s = (v ?? "").toLowerCase();
  const hit = CATEGORIES.find((c) => s.includes(c));
  if (hit) return hit;
  if (s.includes("employment") || s.includes("vacanc")) return "job";
  return fallback;
}

/** Cross-source key: same title + organisation + closing date = same listing. */
export function crossSourceKey(title: string, provider: string | null, closesAt: string | null): string {
  const n = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `t:${n(title)}|o:${n(provider)}|c:${closesAt ?? ""}`;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

export function normalise(raw: RawItem, fallback: OpportunityCategory | null): NormalisedOpportunity | null {
  const title = clean(raw.title);
  const sourceUrl = raw.link ? normaliseUrl(raw.link) : null;
  if (!title || !sourceUrl) return null; // never invent a title or link
  const provider = clean(raw.provider);
  const closes = toIsoDate(raw.closesAt);
  const out = {
    external_id: clean(raw.externalId) ?? sourceUrl,
    title,
    description: clean(raw.description),
    category: mapCategory(raw.category, fallback),
    provider_name: provider,
    eligibility_criteria: clean(raw.eligibility),
    location: clean(raw.location),
    application_requirements: clean(raw.requirements),
    opens_at: toIsoDate(raw.opensAt),
    closes_at: closes,
    source_url: sourceUrl,
    application_url: raw.applicationUrl ? normaliseUrl(raw.applicationUrl) : null,
    dedupe_key: crossSourceKey(title, provider, closes),
  };
  return { ...out, content_hash: hash(JSON.stringify({ ...out, external_id: undefined })) };
}

export function isActive(o: { closes_at: string | null; removed_at_source_at?: string | null }, today = new Date()): boolean {
  if (o.removed_at_source_at) return false;
  return !o.closes_at || o.closes_at >= today.toISOString().slice(0, 10);
}
