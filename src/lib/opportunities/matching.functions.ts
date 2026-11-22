import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { cleanMatchFilters, confirmedProfile, matchOpportunity, type MatchStatus } from "./matching";

const PAGE_SIZE = 24;
type OpportunityPage = Pick<Database["public"]["Tables"]["opportunities"]["Row"],
  "id" | "title" | "description" | "category" | "provider_name" | "eligibility_criteria" | "location" | "application_requirements" | "closes_at" | "source_url" | "application_url" | "attribution_name" | "location_restrictions" | "south_africa_eligibility">;

async function allActiveOpportunities(supabase: SupabaseClient<Database>) {
  // The authenticated client applies the active-opportunity RLS policy on every page.
  const rows: OpportunityPage[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("opportunities").select(
      "id,title,description,category,provider_name,eligibility_criteria,location,application_requirements,closes_at,source_url,application_url,attribution_name,location_restrictions,south_africa_eligibility",
    ).order("closes_at", { ascending: true, nullsFirst: false }).order("id").range(from, from + 999);
    if (error) throw new Error("Could not load opportunities");
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export const getMatchedOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, unknown>) => cleanMatchFilters(input))
  .handler(async ({ data: filters, context }) => {
    const { supabase, userId } = context;
    const { data: customer, error: customerError } = await supabase.from("customer_profiles").select("id").eq("user_id", userId).maybeSingle();
    if (customerError) throw new Error("Could not load the applicant profile");
    const [entriesResult, savedResult, opportunities] = await Promise.all([
      customer ? supabase.from("career_profile_entries").select("kind,confirmed_data").eq("customer_id", customer.id).not("confirmed_data", "is", null) : Promise.resolve({ data: [], error: null }),
      customer ? supabase.from("saved_opportunities").select("opportunity_id").eq("customer_id", customer.id) : Promise.resolve({ data: [], error: null }),
      allActiveOpportunities(supabase),
    ]);
    if (entriesResult.error || savedResult.error) throw new Error("Could not load applicant matches");
    const profile = confirmedProfile(entriesResult.data ?? []);
    const saved = new Set((savedResult.data ?? []).map((row) => row.opportunity_id));
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const closingLimit = filters.closing === "all" ? null : new Date(now.getTime() + Number(filters.closing) * 86400000).toISOString().slice(0, 10);
    const statusRank: Record<MatchStatus, number> = { eligible: 0, potential: 1, not_eligible: 2 };
    const counts: Record<MatchStatus, number> = { eligible: 0, potential: 0, not_eligible: 0 };

    const matched = opportunities.map((opportunity) => ({ opportunity, match: matchOpportunity(opportunity, profile, now) }));
    matched.forEach(({ match }) => { counts[match.status]++; });
    const filtered = matched.filter(({ opportunity, match }) => {
      if (filters.category !== "all" && opportunity.category !== filters.category) return false;
      if (filters.location && !`${opportunity.location || ""} ${(opportunity.location_restrictions || []).join(" ")}`.toLowerCase().includes(filters.location.toLowerCase())) return false;
      if (closingLimit && (!opportunity.closes_at || opportunity.closes_at < today || opportunity.closes_at > closingLimit)) return false;
      if (filters.status !== "all" && match.status !== filters.status) return false;
      if (filters.savedOnly && !saved.has(opportunity.id)) return false;
      return true;
    }).sort((a, b) => statusRank[a.match.status] - statusRank[b.match.status]
      || (a.opportunity.closes_at || "9999-12-31").localeCompare(b.opportunity.closes_at || "9999-12-31")
      || a.opportunity.title.localeCompare(b.opportunity.title));
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ opportunity, match }) => ({
      id: opportunity.id,
      title: opportunity.title,
      providerName: opportunity.provider_name,
      category: opportunity.category,
      location: opportunity.location,
      closesAt: opportunity.closes_at,
      description: opportunity.description?.slice(0, 500) || null,
      sourceUrl: opportunity.source_url,
      applicationUrl: opportunity.application_url,
      sourceName: opportunity.attribution_name || "Original source",
      saved: saved.has(opportunity.id),
      match,
    }));
    return {
      items, counts, page, pageCount, totalFiltered: filtered.length, totalActive: opportunities.length,
      savedTotal: saved.size, confirmedEntries: profile.all.length,
    };
  });

export const setOpportunitySaved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { opportunityId: string; saved: boolean }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.opportunityId) || typeof input.saved !== "boolean") throw new Error("Invalid saved opportunity request");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: customer, error: customerError } = await supabase.from("customer_profiles").select("id").eq("user_id", userId).maybeSingle();
    if (customerError || !customer) throw new Error("Create your applicant profile before saving opportunities");
    if (data.saved) {
      const { error } = await supabase.from("saved_opportunities").insert({ customer_id: customer.id, opportunity_id: data.opportunityId });
      // A repeated click after another tab saved it is already in the requested state.
      if (error && error.code !== "23505") throw new Error("This opportunity could not be saved");
    } else {
      const { error } = await supabase.from("saved_opportunities").delete().eq("customer_id", customer.id).eq("opportunity_id", data.opportunityId);
      if (error) throw new Error("This saved opportunity could not be removed");
    }
    return { saved: data.saved };
  });
