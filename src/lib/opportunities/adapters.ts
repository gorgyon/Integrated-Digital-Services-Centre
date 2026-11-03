/** Source adapters. Each turns one permitted source into RawItems; no scraping. */
import type { RawItem, SouthAfricaEligibility } from "./normalise";

export interface SourceConfig {
  id: string;
  name: string;
  kind: "rss" | "api";
  endpoint_url: string;
  cache_etag?: string | null;
  cache_marker?: string | null;
}

export interface FetchResult {
  items: RawItem[];
  /** True when the source returned its full list of live listings (unseen ones were removed at source). */
  complete: boolean;
  /** True when the cached copy is still current; nothing to process. */
  notModified?: boolean;
  etag?: string | null;
  marker?: string | null;
}

export interface SourceAdapter {
  fetchItems(source: SourceConfig, fetcher?: typeof fetch): Promise<FetchResult>;
}

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]!).trim() : null;
}

/** Parses RSS 2.0 <item> and Atom <entry>; only fields present are returned. */
export function parseFeed(xml: string): RawItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return blocks.map((b) => {
    const atomLink = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? null;
    return {
      externalId: tag(b, "guid") ?? tag(b, "id"),
      title: tag(b, "title"),
      description: tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content"),
      link: tag(b, "link") || atomLink,
      provider: tag(b, "dc:creator") ?? tag(b, "author"),
      category: tag(b, "category"),
      opensAt: tag(b, "pubDate") ?? tag(b, "published"),
      closesAt: tag(b, "closingDate") ?? tag(b, "closing_date"),
    };
  });
}

const USER_AGENT = "IDSC-OpportunityCollector/1.0 (permitted-sources-only)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(url: string, fetcher: typeof fetch, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetcher(url, { headers: { "User-Agent": USER_AGENT, ...headers }, signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    // Access refused or rate-limited: stop, never work around it.
    throw new Error(`Source refused access [${res.status}]`);
  }
  if (res.status !== 304 && !res.ok) throw new Error(`Source request failed [${res.status}]`);
  return res;
}

export const rssAdapter: SourceAdapter = {
  async fetchItems(source, fetcher = fetch) {
    return { items: parseFeed(await (await request(source.endpoint_url, fetcher)).text()), complete: false };
  },
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : null);

/** Salary only when the source states an amount; never estimated. */
export function salaryText(min: unknown, max: unknown, currency: unknown, period: unknown): string | null {
  const lo = num(min), hi = num(max);
  if (lo === null && hi === null) return null;
  const range = lo !== null && hi !== null && lo !== hi ? `${lo}–${hi}` : String(lo ?? hi);
  return [str(currency), range, str(period) ? `per ${str(period)}` : null].filter(Boolean).join(" ");
}

const unixToIso = (v: unknown) => (num(v) ? new Date(num(v)! * 1000).toISOString() : null);
const isSA = (s: string) => /^(south africa|za)$/i.test(s.trim());

/** Himalayas: remote jobs; country list is a hard restriction, an empty list means the source states none. */
export function himalayasEligibility(restrictions: string[]): SouthAfricaEligibility {
  if (!restrictions.length) return "not_stated";
  return restrictions.some(isSA) ? "open_to_south_africa" : "restricted_elsewhere";
}

export function mapHimalayasJob(j: Record<string, unknown>): RawItem {
  const restrictions = Array.isArray(j.locationRestrictions) ? j.locationRestrictions.filter((x): x is string => typeof x === "string") : [];
  const type = str(j.employmentType);
  return {
    externalId: str(j.guid),
    title: str(j.title),
    description: str(j.description) ?? str(j.excerpt),
    link: str(j.guid), // Himalayas listing page
    applicationUrl: str(j.applicationLink), // kept unchanged (Himalayas API terms)
    provider: str(j.companyName),
    category: type && /intern/i.test(type) ? "internship" : "job",
    employmentType: type,
    location: restrictions.length ? `Remote – ${restrictions.join(", ")} only` : "Remote – location restrictions not stated by source",
    locationRestrictions: restrictions,
    remote: true,
    southAfricaEligibility: himalayasEligibility(restrictions),
    scope: "international",
    salary: salaryText(j.minSalary, j.maxSalary, j.currency, j.salaryPeriod),
    closesAt: unixToIso(j.expiryDate), // latest listing date; Himalayas notes jobs can close earlier
    preserveLinks: true,
  };
}

/** Recent pages only, ~1 request per second, within the public no-key allowance. */
const HIMALAYAS_PAGES = 5;

export const himalayasAdapter: SourceAdapter = {
  async fetchItems(source, fetcher = fetch) {
    const items: RawItem[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < HIMALAYAS_PAGES; page++) {
      if (page) await sleep(1100);
      const url = new URL(source.endpoint_url);
      url.searchParams.set("limit", "20");
      if (cursor) url.searchParams.set("cursor", cursor);
      const body = (await (await request(url.toString(), fetcher)).json()) as { jobs?: Record<string, unknown>[]; nextCursor?: string | null };
      items.push(...(body.jobs ?? []).map(mapHimalayasJob));
      cursor = body.nextCursor ?? null;
      if (!cursor) break;
    }
    return { items, complete: false };
  },
};

/** Green Level: green-economy specialist jobs; location stated by country, "remote" only when the source says so. */
export function greenLevelEligibility(country: string | null, remote: boolean): SouthAfricaEligibility {
  if (country && isSA(country)) return "in_south_africa";
  if (!country || /^remote$/i.test(country)) return "not_stated";
  return remote ? "not_stated" : "restricted_elsewhere";
}

export function mapGreenLevelJob(j: Record<string, unknown>): RawItem {
  const country = str(j.country);
  const remote = j.remote === "remote";
  const type = str(j.type);
  const place = [str(j.location), country && country !== str(j.location) ? country : null].filter(Boolean).join(", ");
  return {
    externalId: str(j.id),
    title: str(j.title),
    link: str(j.url), // canonical Green Level page; full job pages are not republished
    provider: str(j.company),
    category: type === "internship" ? "internship" : "job",
    employmentType: type,
    location: place || null,
    remote: remote || null,
    locationRestrictions: country && !/^remote$/i.test(country) ? [country] : null,
    southAfricaEligibility: greenLevelEligibility(country, remote),
    scope: country && isSA(country) ? "south_africa" : "international_specialist",
    salary: salaryText(j.salary_min, j.salary_max, j.salary_currency, j.salary_period),
    opensAt: str(j.date_posted),
    closesAt: str(j.date_expires),
    preserveLinks: true,
  };
}

export const greenLevelAdapter: SourceAdapter = {
  async fetchItems(source, fetcher = fetch) {
    // One cached, conditional request per run (published limit: max 1 request/second; cache the data).
    const res = await request(source.endpoint_url, fetcher, source.cache_etag ? { "If-None-Match": source.cache_etag } : {});
    if (res.status === 304) return { items: [], complete: false, notModified: true, etag: source.cache_etag };
    const body = (await res.json()) as { generated?: string; jobs?: Record<string, unknown>[] };
    const etag = res.headers.get("etag");
    if (body.generated && body.generated === source.cache_marker) {
      return { items: [], complete: false, notModified: true, etag, marker: body.generated };
    }
    return { items: (body.jobs ?? []).map(mapGreenLevelJob), complete: true, etag, marker: body.generated ?? null };
  },
};

/** Official APIs differ per provider; each approved API gets its own adapter here. */
const apiAdapters: Record<string, SourceAdapter> = {
  Himalayas: himalayasAdapter,
  "Green Level": greenLevelAdapter,
};

export function adapterFor(source: SourceConfig): SourceAdapter {
  if (source.kind === "rss") return rssAdapter;
  const a = apiAdapters[source.name];
  if (!a) throw new Error(`No approved API adapter registered for "${source.name}"`);
  return a;
}
