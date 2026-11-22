import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, BookmarkCheck, Building2, CalendarDays, Check, CircleAlert, CircleX, ExternalLink, MapPin } from "lucide-react";
import { toast } from "sonner";

import { getMatchedOpportunities, setOpportunitySaved } from "@/lib/opportunities/matching.functions";
import { cleanMatchFilters, type MatchFilters, type MatchStatus, type RequirementResult } from "@/lib/opportunities/matching";
import { platform } from "@/lib/platform";
import { SignOutButton } from "@/components/SignOutButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const matchedOptions = (filters: MatchFilters) => queryOptions({
  queryKey: ["matched-opportunities", filters],
  queryFn: () => getMatchedOpportunities({ data: filters }),
});

export const Route = createFileRoute("/_authenticated/opportunities")({
  validateSearch: (search: Record<string, unknown>) => cleanMatchFilters(search),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(matchedOptions(deps)),
  head: () => ({ meta: [
    { title: "Matched opportunities | IDSC" },
    { name: "description", content: "Compare current vacancies with your confirmed career profile and save opportunities." },
    { property: "og:title", content: "Matched opportunities | IDSC" },
    { property: "og:description", content: "Transparent vacancy matching with original application links." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  errorComponent: ({ error }) => <Shell><div role="alert" className="rounded-lg border border-destructive p-4"><p className="font-medium">Opportunities could not load</p><p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Please try again."}</p></div></Shell>,
  notFoundComponent: () => <Shell><p>No opportunities found.</p></Shell>,
  component: OpportunitiesPage,
});

const SELECT_CLASS = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
const STATUS: Record<MatchStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  eligible: { label: "Eligible", variant: "default" },
  potential: { label: "Potential match", variant: "secondary" },
  not_eligible: { label: "Not eligible", variant: "destructive" },
};
const CATEGORIES = ["job", "bursary", "scholarship", "internship", "learnership", "apprenticeship", "grant", "other"];

function OpportunitiesPage() {
  const filters = Route.useSearch();
  const { data } = useSuspenseQuery(matchedOptions(filters));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saveOpportunity = useServerFn(setOpportunitySaved);
  const [saving, setSaving] = useState<string | null>(null);

  function update(patch: Record<string, unknown>) {
    const next = cleanMatchFilters({ ...filters, ...patch, page: patch["page"] ?? 1 });
    void navigate({ to: "/opportunities", search: next });
  }

  async function toggleSaved(id: string, saved: boolean) {
    setSaving(id);
    try {
      await saveOpportunity({ data: { opportunityId: id, saved: !saved } });
      toast.success(saved ? "Removed from saved opportunities" : "Opportunity saved");
      await queryClient.invalidateQueries({ queryKey: ["matched-opportunities"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update saved opportunities");
    } finally {
      setSaving(null);
    }
  }

  return <Shell>
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Career & Opportunities</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Matched opportunities</h1>
        </div>
        <Button variant="outline" asChild><Link to="/profile">Update career profile</Link></Button>
      </div>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Compare current opportunities with your confirmed education, results, skills, experience and credentials. Missing information never causes a rejection by itself.
      </p>
    </section>

    {data.confirmedEntries === 0 ? <Card className="border-primary/40 bg-primary/5">
      <CardHeader><CardTitle className="text-lg">Start with your confirmed profile</CardTitle>
        <CardDescription>Your results are potential matches until you add and confirm career details. Unconfirmed drafts are never used.</CardDescription></CardHeader>
      <CardContent><Button asChild><Link to="/profile">Complete my profile</Link></Button></CardContent>
    </Card> : <p className="text-sm text-muted-foreground">Matching uses {data.confirmedEntries} confirmed profile {data.confirmedEntries === 1 ? "entry" : "entries"}; drafts are excluded.</p>}

    <div className="grid grid-cols-3 gap-2" aria-label="Match summary">
      {(Object.keys(STATUS) as MatchStatus[]).map((status) => <button key={status} type="button" onClick={() => update({ status: filters.status === status ? "all" : status })}
        className={`rounded-lg border p-3 text-left transition-colors ${filters.status === status ? "border-primary bg-primary/5" : "bg-card hover:bg-accent"}`} aria-pressed={filters.status === status}>
        <span className="block text-2xl font-semibold">{data.counts[status]}</span><span className="mt-1 block text-xs leading-4 text-muted-foreground">{STATUS[status].label}</span>
      </button>)}
    </div>

    <Card>
      <CardHeader className="pb-4"><CardTitle className="text-lg">Filter opportunities</CardTitle><CardDescription>{data.totalActive} current opportunities; expired and removed listings are hidden.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <form className="space-y-2 sm:col-span-2 lg:col-span-1" onSubmit={(event) => { event.preventDefault(); update({ location: String(new FormData(event.currentTarget).get("location") ?? "") }); }}>
          <Label htmlFor="location">Location</Label><div className="flex gap-2"><Input id="location" name="location" defaultValue={filters.location} placeholder="e.g. Remote or Limpopo" /><Button type="submit" variant="outline">Go</Button></div>
        </form>
        <div className="space-y-2"><Label htmlFor="category">Category</Label><select id="category" className={SELECT_CLASS} value={filters.category} onChange={(event) => update({ category: event.target.value })}>
          <option value="all">All categories</option>{CATEGORIES.map((category) => <option key={category} value={category}>{category[0]!.toUpperCase() + category.slice(1)}</option>)}
        </select></div>
        <div className="space-y-2"><Label htmlFor="closing">Closing date</Label><select id="closing" className={SELECT_CLASS} value={filters.closing} onChange={(event) => update({ closing: event.target.value })}>
          <option value="all">Any closing date</option><option value="7">Next 7 days</option><option value="30">Next 30 days</option><option value="90">Next 90 days</option>
        </select></div>
        <div className="space-y-2"><Label htmlFor="status">Eligibility</Label><select id="status" className={SELECT_CLASS} value={filters.status} onChange={(event) => update({ status: event.target.value })}>
          <option value="all">All match results</option><option value="eligible">Eligible</option><option value="potential">Potential match</option><option value="not_eligible">Not eligible</option>
        </select></div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="button" variant={filters.savedOnly ? "default" : "outline"} aria-pressed={filters.savedOnly} onClick={() => update({ savedOnly: !filters.savedOnly })}><Bookmark className="size-4" />Saved ({data.savedTotal})</Button>
          <Button type="button" variant="ghost" onClick={() => update(cleanMatchFilters({}))}>Clear filters</Button>
        </div>
      </CardContent>
    </Card>

    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><p>{data.totalFiltered} {data.totalFiltered === 1 ? "opportunity" : "opportunities"} found</p><p>Page {data.page} of {data.pageCount}</p></div>

    {data.items.length === 0 ? <Card><CardContent className="py-10 text-center"><p className="font-medium">No opportunities match these filters</p><p className="mt-2 text-sm text-muted-foreground">Try a wider closing date, another category or all match results.</p><Button variant="outline" className="mt-4" onClick={() => update(cleanMatchFilters({}))}>Clear filters</Button></CardContent></Card> : null}

    <section className="space-y-5" aria-label="Matched opportunity results">
      {data.items.map((opportunity) => {
        const status = STATUS[opportunity.match.status];
        const applyUrl = opportunity.applicationUrl || opportunity.sourceUrl;
        return <Card key={opportunity.id} className="overflow-hidden">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap gap-2"><Badge variant={status.variant}>{status.label}</Badge>{opportunity.category ? <Badge variant="outline" className="capitalize">{opportunity.category}</Badge> : null}</div>
                <CardTitle className="text-xl leading-7">{opportunity.title}</CardTitle>
                <CardDescription className="mt-1 text-sm">{opportunity.providerName || "Organisation not stated by source"}</CardDescription></div>
              <Button type="button" variant={opportunity.saved ? "default" : "outline"} size="sm" disabled={saving === opportunity.id} onClick={() => void toggleSaved(opportunity.id, opportunity.saved)}>
                {opportunity.saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}{saving === opportunity.id ? "Updating…" : opportunity.saved ? "Saved" : "Save"}
              </Button>
            </div>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-4">
              <span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0" />{opportunity.location || "Location not stated by source"}</span>
              <span className="flex items-start gap-1.5"><CalendarDays className="mt-0.5 size-4 shrink-0" />{formatClosing(opportunity.closesAt)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-medium leading-6">{opportunity.match.explanation}</p>
            {opportunity.description ? <p className="break-words text-sm leading-6 text-muted-foreground">{opportunity.description}{opportunity.description.length === 500 ? "…" : ""}</p> : null}
            <details className="rounded-lg border bg-muted/30 p-4">
              <summary className="cursor-pointer text-sm font-medium">Requirements and match explanation</summary>
              <div className="mt-4 space-y-4">
                {opportunity.match.mandatory.length ? <RequirementList title="Mandatory requirements" items={opportunity.match.mandatory} /> : <p className="text-sm text-muted-foreground">No clear mandatory requirements were identified in the source text.</p>}
                {opportunity.match.preferred.length ? <RequirementList title="Preferred requirements — not used to reject" items={opportunity.match.preferred} /> : null}
                {opportunity.match.matched.length ? <div><h3 className="text-sm font-semibold">Matched qualifications, skills and experience</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{opportunity.match.matched.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
              </div>
            </details>
            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Source: {opportunity.sourceName}. IDSC does not apply on your behalf.</p>
              <Button asChild><a href={applyUrl} target="_blank" rel="noopener noreferrer">View original & apply<ExternalLink className="size-4" /></a></Button>
            </div>
          </CardContent>
        </Card>;
      })}
    </section>

    {data.pageCount > 1 ? <nav className="flex items-center justify-between" aria-label="Opportunity pages">
      <Button variant="outline" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })}>Previous</Button>
      <span className="text-sm text-muted-foreground">Page {data.page} of {data.pageCount}</span>
      <Button variant="outline" disabled={data.page >= data.pageCount} onClick={() => update({ page: data.page + 1 })}>Next</Button>
    </nav> : null}
  </Shell>;
}

function RequirementList({ title, items }: { title: string; items: RequirementResult[] }) {
  return <div><h3 className="text-sm font-semibold">{title}</h3><ul className="mt-2 space-y-3">{items.map((item, index) => <li key={`${index}-${item.text}`} className="flex gap-2 text-sm">
    {item.met === true ? <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-label="Met" /> : item.met === false ? <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Not met" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not confirmed" />}
    <div className="min-w-0"><p className="break-words">{item.text}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.reason}</p></div>
  </li>)}</ul></div>;
}

function formatClosing(date: string | null) {
  if (!date) return "Closing date not stated by source";
  return `Closes ${new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-6xl items-center gap-3">
      <Link to="/account" className="flex items-center gap-2"><Building2 className="size-7 text-primary" /><span className="text-xl font-bold">{platform.shortName}</span></Link>
      <span className="ml-auto flex items-center gap-3"><Link to="/account" className="text-sm font-medium text-primary underline-offset-4 hover:underline">My account</Link><SignOutButton /></span>
    </div></header>
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10">{children}</main>
  </div>;
}
