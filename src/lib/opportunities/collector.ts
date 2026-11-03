/** Server-only collection run. Called by the scheduled route with the trusted client. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { adapterFor } from "./adapters";
import { normalise, type OpportunityCategory } from "./normalise";

type Db = SupabaseClient<Database>;

export async function collectDueSources(db: Db, now = new Date()) {
  const { data: sources, error } = await db
    .from("opportunity_sources")
    .select("id,name,kind,endpoint_url,default_category,fetch_interval_hours,last_run_at,requires_credentials")
    .eq("enabled", true);
  if (error) throw new Error(`Could not load sources: ${error.message}`);
  const due = (sources ?? []).filter(
    (s) => !s.last_run_at || now.getTime() - new Date(s.last_run_at).getTime() >= s.fetch_interval_hours * 3600_000 - 60_000,
  );
  const results = [];
  for (const s of due) results.push(await collectSource(db, s, now));
  return { sourcesRun: results.length, results };
}

async function collectSource(
  db: Db,
  s: { id: string; name: string; kind: "rss" | "api"; endpoint_url: string; default_category: OpportunityCategory | null },
  now: Date,
) {
  const { data: run } = await db.from("opportunity_collection_runs").insert({ source_id: s.id }).select("id").single();
  const c = { items_found: 0, items_created: 0, items_updated: 0, items_unchanged: 0, items_skipped: 0 };
  const errors: { item?: string; message: string }[] = [];
  let status: "succeeded" | "partial" | "failed" = "succeeded";
  try {
    const raw = await adapterFor(s).fetchItems(s);
    c.items_found = raw.length;
    for (const r of raw) {
      const n = normalise(r, s.default_category);
      if (!n) { c.items_skipped++; continue; }
      try {
        c[await upsert(db, s.id, n, now.toISOString())]++;
      } catch (e) {
        errors.push({ item: n.external_id, message: (e as Error).message });
      }
    }
    if (errors.length) status = "partial";
  } catch (e) {
    status = "failed";
    errors.push({ message: (e as Error).message });
  }
  if (run) {
    await db.from("opportunity_collection_runs")
      .update({ ...c, status, errors, finished_at: new Date().toISOString() }).eq("id", run.id);
  }
  await db.from("opportunity_sources").update({ last_run_at: now.toISOString() }).eq("id", s.id);
  return { source: s.name, status, ...c, errors: errors.length };
}

/** Duplicate rules: (1) same source + external id; (2) same title + organisation + closing date. */
async function upsert(db: Db, sourceId: string, n: ReturnType<typeof normalise> & object, seen: string)
  : Promise<"items_created" | "items_updated" | "items_unchanged"> {
  const { external_id, ...fields } = n;
  const { data: link } = await db.from("opportunity_source_links")
    .select("id,opportunity_id").eq("source_id", sourceId).eq("external_id", external_id).maybeSingle();
  let existing = link
    ? (await db.from("opportunities").select("id,content_hash").eq("id", link.opportunity_id).maybeSingle()).data
    : (await db.from("opportunities").select("id,content_hash").eq("dedupe_key", n.dedupe_key).maybeSingle()).data;

  let outcome: "items_created" | "items_updated" | "items_unchanged";
  if (!existing) {
    const { data, error } = await db.from("opportunities")
      .insert({ ...fields, collected_at: seen, last_updated_at: seen, last_seen_at: seen }).select("id,content_hash").single();
    if (error) throw new Error(error.message);
    existing = data;
    outcome = "items_created";
  } else if (existing.content_hash !== n.content_hash) {
    const { error } = await db.from("opportunities")
      .update({ ...fields, last_updated_at: seen, last_seen_at: seen, removed_at_source_at: null }).eq("id", existing.id);
    if (error) throw new Error(error.message);
    outcome = "items_updated";
  } else {
    await db.from("opportunities").update({ last_seen_at: seen }).eq("id", existing.id);
    outcome = "items_unchanged";
  }
  if (link) await db.from("opportunity_source_links").update({ last_seen_at: seen }).eq("id", link.id);
  else await db.from("opportunity_source_links").insert({
    opportunity_id: existing!.id, source_id: sourceId, external_id, original_url: n.source_url, first_seen_at: seen, last_seen_at: seen,
  });
  return outcome;
}
