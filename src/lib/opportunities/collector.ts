/** Server-only collection run. Called by the scheduled route with the trusted client. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { adapterFor } from "./adapters";
import { normalise, type NormalisedOpportunity, type OpportunityCategory } from "./normalise";

type Db = SupabaseClient<Database>;
type Source = Database["public"]["Tables"]["opportunity_sources"]["Row"];

const chunk = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Runs at most `maxSources` due sources per call so each scheduled call stays short. */
export async function collectDueSources(db: Db, now = new Date(), maxSources = 1) {
  const { data: sources, error } = await db.from("opportunity_sources").select("*").eq("enabled", true);
  if (error) throw new Error(`Could not load sources: ${error.message}`);
  const due = (sources ?? [])
    .filter((s) => !s.last_run_at || now.getTime() - new Date(s.last_run_at).getTime() >= s.fetch_interval_hours * 3600_000 - 60_000)
    .sort((a, b) => (a.last_run_at ?? "").localeCompare(b.last_run_at ?? ""))
    .slice(0, maxSources);
  const results = [];
  for (const s of due) results.push(await collectSource(db, s, now));
  return { sourcesRun: results.length, results };
}

async function collectSource(db: Db, s: Source, now: Date) {
  const { data: run } = await db.from("opportunity_collection_runs").insert({ source_id: s.id }).select("id").single();
  const c = { items_found: 0, items_created: 0, items_updated: 0, items_unchanged: 0, items_skipped: 0 };
  const errors: { item?: string; message: string }[] = [];
  let status: "succeeded" | "partial" | "failed" = "succeeded";
  const cache: { cache_etag?: string | null; cache_marker?: string | null } = {};
  try {
    const res = await adapterFor(s).fetchItems(s);
    if (res.etag !== undefined) cache.cache_etag = res.etag;
    if (res.marker !== undefined) cache.cache_marker = res.marker;
    c.items_found = res.items.length;
    const byExt = new Map<string, NormalisedOpportunity>();
    for (const r of res.items) {
      const n = normalise(r, s.default_category as OpportunityCategory | null);
      if (!n) c.items_skipped++;
      else byExt.set(n.external_id, n);
    }
    await store(db, s, [...byExt.values()], now.toISOString(), res.complete, c, errors);
    if (errors.length) status = "partial";
  } catch (e) {
    status = "failed";
    errors.push({ message: (e as Error).message });
  }
  if (run) {
    await db.from("opportunity_collection_runs")
      .update({ ...c, status, errors, finished_at: new Date().toISOString() }).eq("id", run.id);
  }
  await db.from("opportunity_sources").update({ last_run_at: now.toISOString(), ...cache }).eq("id", s.id);
  return { source: s.name, status, ...c, errors: errors.length };
}

/** Duplicate rules: (1) same source + external id; (2) same title + organisation + closing date. Batched. */
async function store(
  db: Db, s: Source, items: NormalisedOpportunity[], seen: string, complete: boolean,
  c: Record<"items_created" | "items_updated" | "items_unchanged", number>, errors: { item?: string; message: string }[],
) {
  const links = new Map<string, { id: string; opportunity_id: string }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("opportunity_source_links").select("id,external_id,opportunity_id")
      .eq("source_id", s.id).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const l of data ?? []) links.set(l.external_id, l);
    if (!data || data.length < 1000) break;
  }
  const opps = new Map<string, { id: string; content_hash: string; dedupe_key: string }>();
  const byKey = new Map<string, { id: string; content_hash: string; dedupe_key: string }>();
  const linkedIds = items.map((n) => links.get(n.external_id)?.opportunity_id).filter((x): x is string => !!x);
  const keys = items.filter((n) => !links.has(n.external_id)).map((n) => n.dedupe_key);
  for (const ids of chunk(linkedIds)) {
    const { data } = await db.from("opportunities").select("id,content_hash,dedupe_key").in("id", ids);
    for (const o of data ?? []) opps.set(o.id, o);
  }
  for (const ks of chunk([...new Set(keys)])) {
    const { data } = await db.from("opportunities").select("id,content_hash,dedupe_key").in("dedupe_key", ks);
    for (const o of data ?? []) byKey.set(o.dedupe_key, o);
  }

  const attribution = { attribution_name: s.attribution_name ?? s.name, attribution_url: s.attribution_url };
  const row = ({ external_id: _e, ...f }: NormalisedOpportunity) => ({ ...f, ...attribution });
  const toCreate = new Map<string, NormalisedOpportunity>();
  const unchanged: string[] = [];
  const target = new Map<string, string>(); // external_id -> opportunity id
  for (const n of items) {
    const link = links.get(n.external_id);
    const ex = link ? opps.get(link.opportunity_id) : byKey.get(n.dedupe_key);
    if (!ex) {
      if (!toCreate.has(n.dedupe_key)) toCreate.set(n.dedupe_key, n);
      continue;
    }
    target.set(n.external_id, ex.id);
    if (ex.content_hash === n.content_hash) { unchanged.push(ex.id); c.items_unchanged++; continue; }
    const { error } = await db.from("opportunities")
      .update({ ...row(n), last_updated_at: seen, last_seen_at: seen, removed_at_source_at: null }).eq("id", ex.id);
    if (error) errors.push({ item: n.external_id, message: error.message });
    else c.items_updated++;
  }
  for (const part of chunk([...toCreate.values()])) {
    const { data, error } = await db.from("opportunities")
      .insert(part.map((n) => ({ ...row(n), collected_at: seen, last_updated_at: seen, last_seen_at: seen })))
      .select("id,dedupe_key");
    if (error) { errors.push({ message: `Create failed: ${error.message}` }); continue; }
    for (const o of data ?? []) byKey.set(o.dedupe_key, { ...o, content_hash: "" });
    c.items_created += data?.length ?? 0;
  }
  for (const n of items) if (!target.has(n.external_id) && byKey.get(n.dedupe_key)) target.set(n.external_id, byKey.get(n.dedupe_key)!.id);
  for (const ids of chunk(unchanged)) {
    await db.from("opportunities").update({ last_seen_at: seen, removed_at_source_at: null }).in("id", ids);
  }

  const seenLinkIds = items.map((n) => links.get(n.external_id)?.id).filter((x): x is string => !!x);
  for (const ids of chunk(seenLinkIds)) await db.from("opportunity_source_links").update({ last_seen_at: seen }).in("id", ids);
  const newLinks = items.filter((n) => !links.has(n.external_id) && target.has(n.external_id)).map((n) => ({
    opportunity_id: target.get(n.external_id)!, source_id: s.id, external_id: n.external_id,
    original_url: n.source_url, first_seen_at: seen, last_seen_at: seen,
  }));
  for (const part of chunk(newLinks)) {
    const { error } = await db.from("opportunity_source_links").insert(part);
    if (error) errors.push({ message: `Source link failed: ${error.message}` });
  }

  // Full live list from the source: anything no longer listed there is closed at source.
  if (complete) {
    const present = new Set(items.map((n) => n.external_id));
    const gone = [...links.entries()].filter(([ext]) => !present.has(ext)).map(([, l]) => l.opportunity_id);
    for (const ids of chunk(gone)) {
      await db.from("opportunities").update({ removed_at_source_at: seen }).in("id", ids).is("removed_at_source_at", null);
    }
  }
}
