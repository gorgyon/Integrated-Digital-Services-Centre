/** Source adapters. Each turns one permitted source into RawItems; no scraping. */
import type { RawItem } from "./normalise";

export interface SourceConfig {
  id: string;
  name: string;
  kind: "rss" | "api";
  endpoint_url: string;
}

export interface SourceAdapter {
  fetchItems(source: SourceConfig, fetcher?: typeof fetch): Promise<RawItem[]>;
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

async function get(url: string, fetcher: typeof fetch): Promise<string> {
  const res = await fetcher(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    // Access refused or rate-limited: stop, never work around it.
    throw new Error(`Source refused access [${res.status}]`);
  }
  if (!res.ok) throw new Error(`Source request failed [${res.status}]`);
  return res.text();
}

export const rssAdapter: SourceAdapter = {
  async fetchItems(source, fetcher = fetch) {
    return parseFeed(await get(source.endpoint_url, fetcher));
  },
};

/** Official APIs differ per provider; each approved API gets its own adapter here. */
const apiAdapters: Record<string, SourceAdapter> = {};

export function adapterFor(source: SourceConfig): SourceAdapter {
  if (source.kind === "rss") return rssAdapter;
  const a = apiAdapters[source.name];
  if (!a) throw new Error(`No approved API adapter registered for "${source.name}"`);
  return a;
}
