import { Fragment, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apsScore } from "@/modules/career/aps";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My career profile | IDSC" },
      { name: "description", content: "Your contact details, objective, education, results, experience and skills." },
      { property: "og:title", content: "My career profile | IDSC" },
      { property: "og:description", content: "Your contact details, objective, education, results, experience and skills." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

type Kind = Database["public"]["Enums"]["career_entry_kind"];
type Entry = Database["public"]["Tables"]["career_profile_entries"]["Row"];
type Data = {
  [key: string]: string | undefined;
  title?: string; issuer?: string; field?: string; year?: string; institution?: string; level?: string;
  objective?: string; summary?: string; full_name?: string; phone?: string; email?: string; location?: string;
  languages?: string; interests?: string; duties?: string; subject?: string; grade?: string; qualification?: string;
};
type Field = { key: string; label: string };
type ViewEntry = { primary: Entry; entries: Entry[]; data: Data };

const PERSONAL_FIELDS: Field[] = [
  { key: "full_name", label: "Full name" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
  { key: "location", label: "Location or address" }, { key: "languages", label: "Languages" },
  { key: "interests", label: "Interests and hobbies" }, { key: "objective", label: "Career objective" },
];
const EDUCATION_FIELDS: Field[] = [
  { key: "level", label: "Qualification or level" }, { key: "institution", label: "School or institution" },
  { key: "field", label: "Field of study" }, { key: "year", label: "Year completed" },
];
const QUALIFICATION_FIELDS: Field[] = [
  { key: "title", label: "Qualification" }, { key: "issuer", label: "Issued by" },
  { key: "field", label: "Field of study" }, { key: "year", label: "Year" },
];
const KINDS: { kind: Kind; title: string; fields: Field[] }[] = [
  { kind: "personal", title: "Personal and contact details", fields: PERSONAL_FIELDS },
  { kind: "education", title: "Education", fields: EDUCATION_FIELDS },
  { kind: "qualification", title: "Education", fields: QUALIFICATION_FIELDS },
  { kind: "result", title: "Academic results", fields: [
    { key: "subject", label: "Subject or module" }, { key: "grade", label: "Mark or grade" },
    { key: "year", label: "Year" }, { key: "qualification", label: "Part of qualification" },
  ] },
  { kind: "skill", title: "Skills", fields: [{ key: "name", label: "Skill" }, { key: "level", label: "Level (e.g. Beginner, Advanced)" }] },
  { kind: "experience", title: "Employment history and experience", fields: [
    { key: "role", label: "Role or experience" }, { key: "employer", label: "Employer" },
    { key: "period", label: "Dates" }, { key: "duties", label: "Duties and achievements" },
  ] },
];
const SECTIONS = KINDS.filter(({ kind }) => kind !== "qualification");

const asData = (j: Json | null): Data => (j && typeof j === "object" && !Array.isArray(j) ? (j as Data) : {});
const shownData = (e: Entry) => asData(e.draft_data ?? e.confirmed_data);
const normal = (value: string | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const isSchoolLevel = (value: string | undefined) => /grade 12|national senior certificate|matric/i.test(value ?? "");

/** Older qualification rows and newer education rows are shown as one complete Education card. */
function educationViews(entries: Entry[]): ViewEntry[] {
  const views: ViewEntry[] = [];
  for (const entry of entries) {
    const original = shownData(entry);
    const data: Data = entry.kind === "qualification"
      ? { level: original.title ?? "", institution: original.issuer ?? "", field: original.field ?? "", year: original.year ?? "" }
      : { ...original };
    const prior = views.find((view) => {
      const institutionMatches = normal(view.data.institution) && normal(view.data.institution) === normal(data.institution);
      const levelMatches = normal(view.data.level) && normal(view.data.level) === normal(data.level);
      if (!institutionMatches && !levelMatches) return false;
      if (normal(view.data.institution) && normal(data.institution) && normal(view.data.institution) !== normal(data.institution)) return false;
      if (normal(view.data.level) && normal(data.level) && normal(view.data.level) !== normal(data.level)
        && !(isSchoolLevel(view.data.level) && isSchoolLevel(data.level))) return false;
      return (["field", "year"] as const).every((key) => !view.data[key] || !data[key] || normal(view.data[key]) === normal(data[key]));
    });
    if (!prior) { views.push({ primary: entry, entries: [entry], data }); continue; }
    prior.entries.push(entry);
    if (entry.kind === "qualification" && prior.primary.kind === "education") prior.primary = entry;
    prior.data = {
      institution: prior.data.institution || data.institution || "",
      level: (entry.kind === "qualification" && (isSchoolLevel(data.level) || !prior.data.level) ? data.level : prior.data.level || data.level) ?? "",
      field: prior.data.field || data.field || "",
      year: prior.data.year || data.year || "",
    };
  }
  return views;
}

function viewsFor(kind: Kind, entries: Entry[]): ViewEntry[] {
  const matching = entries.filter((e) => kind === "education" ? e.kind === "education" || e.kind === "qualification" : e.kind === kind);
  return kind === "education" ? educationViews(matching) : matching.map((entry) => ({ primary: entry, entries: [entry], data: shownData(entry) }));
}

function ProfilePage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ kind: Kind; entry: Entry | null; initial?: Data } | null>(null);
  const entries = useQuery({
    queryKey: ["career-profile"],
    queryFn: async () => {
      const { data, error } = await supabase.from("career_profile_entries").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const docs = useQuery({
    queryKey: ["my-career-documents"],
    queryFn: async () => (await supabase.rpc("list_my_career_documents")).data ?? [],
  });
  const docName = (id: string | null) => docs.data?.find((d) => d.id === id)?.original_name;
  const refresh = () => qc.invalidateQueries({ queryKey: ["career-profile"] });

  async function run(p: PromiseLike<{ error: { message: string } | null }>, ok: string) {
    const { error } = await p;
    if (error) toast.error(error.message);
    else { toast.success(ok); refresh(); }
  }

  async function remove(view: ViewEntry) {
    for (const entry of view.entries) {
      const draft = !!entry.draft_data || entry.draft_remove;
      const { error } = draft
        ? await supabase.rpc("discard_career_draft", { _entry: entry.id })
        : await supabase.rpc("request_career_entry_removal", { _entry: entry.id });
      if (error) { toast.error(error.message); return; }
    }
    toast.success(view.entries.some((e) => e.confirmed_data) ? "Removal added for review" : "Draft removed");
    refresh();
  }

  function edit(view: ViewEntry) {
    let initial = view.data;
    if (view.primary.kind === "qualification") initial = {
      title: view.data.level ?? "", issuer: view.data.institution ?? "", field: view.data.field ?? "", year: view.data.year ?? "",
    };
    if (view.primary.kind === "personal" && !initial.objective && initial.summary) initial = { ...initial, objective: initial.summary };
    setEditing({ kind: view.primary.kind, entry: view.primary, initial });
  }

  const all = entries.data ?? [];
  const pending = all.filter((e) => e.draft_data || e.draft_remove);
  if (entries.isError) return <Shell><p className="text-sm text-muted-foreground">Please create your applicant details on the <Link to="/documents" className="text-primary underline">My documents</Link> page first.</p></Shell>;

  return (
    <Shell>
      {pending.length > 0 ? (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Review and confirm</CardTitle>
            <CardDescription>These changes are drafts. They are not part of your profile until you confirm them.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {SECTIONS.filter(({ kind }) => pending.some((e) => kind === "education" ? e.kind === "education" || e.kind === "qualification" : e.kind === kind)).map(({ kind, title }) => {
              const views = viewsFor(kind, pending);
              return <div key={kind} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{title} ({views.length})</h3>
                {views.map((view) => <div key={view.entries.map((e) => e.id).join("-")} className="rounded-md border p-3 text-sm">
                  <EntryContent kind={kind} view={view} docName={docName} includeObjective />
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => remove(view)}>Discard</Button>
                </div>)}
              </div>;
            })}
            <Button onClick={() => run(supabase.rpc("confirm_career_profile"), "Profile confirmed")}>Confirm all changes</Button>
          </CardContent>
        </Card>
      ) : null}

      {SECTIONS.map(({ kind, title }) => {
        const list = viewsFor(kind, all);
        const single = kind === "personal" && list.length > 0;
        const formHere = kind === "education" ? editing?.kind === "education" || editing?.kind === "qualification" : editing?.kind === kind;
        return <Fragment key={kind}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg">{title}</CardTitle>
              <Button size="sm" variant="outline" disabled={(formHere && !editing?.entry) || single} onClick={() => setEditing({ kind, entry: null })}>Add</Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {kind === "result" ? <ApsSummary entries={all.filter((e) => e.kind === "result")} /> : null}
              {formHere && editing ? <EntryForm key={editing.entry?.id ?? `new-${kind}`} {...editing} docs={docs.data ?? []}
                onCancel={() => setEditing(null)} onSave={async (data, file) => {
                  const { error } = await supabase.rpc("save_career_draft", {
                    _entry: editing.entry?.id ?? (null as unknown as string), _kind: editing.kind, _data: data, _file: (file || null) as unknown as string,
                  });
                  if (error) { toast.error(error.message); return; }
                  toast.success("Saved as draft"); setEditing(null); refresh();
                }} /> : null}
              {list.length === 0 && !formHere ? <p className="text-sm text-muted-foreground">No entries yet.</p> : list.map((view) => {
                const isDraft = view.entries.some((e) => e.draft_data || e.draft_remove);
                return <div key={view.entries.map((e) => e.id).join("-")} className="border-b border-border pb-4 text-sm last:border-0 last:pb-0">
                  {isDraft ? <Badge variant="secondary" className="mb-2">{view.entries.some((e) => e.draft_remove) ? "Removal draft" : "Draft"}</Badge> : null}
                  <EntryContent kind={kind} view={view} docName={docName} />
                  <div className="mt-2 flex gap-1">
                    {!view.primary.draft_remove ? <Button size="sm" variant="ghost" onClick={() => edit(view)}>Edit</Button> : null}
                    <Button size="sm" variant="ghost" onClick={() => remove(view)}>Remove</Button>
                  </div>
                </div>;
              })}
            </CardContent>
          </Card>
          {kind === "personal" ? <ObjectiveCard views={list} onEdit={edit} /> : null}
        </Fragment>;
      })}
    </Shell>
  );
}

function EntryContent({ kind, view, docName, includeObjective = false }: {
  kind: Kind; view: ViewEntry; docName: (id: string | null) => string | undefined; includeObjective?: boolean;
}) {
  const d = view.data;
  const primary = view.primary;
  const fileId = primary.draft_data ? primary.draft_file_id : primary.confirmed_file_id;
  const page = primary.draft_data ? primary.draft_source_page : primary.confirmed_source_page;
  if (kind === "personal") return <div className="min-w-0 break-words">
    <p className="text-base font-semibold">{d.full_name || "—"}</p>
    <div className="mt-2 grid gap-2">
      {d.phone ? <p className="flex items-start gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span>{d.phone}</span></p> : null}
      {d.email ? <p className="flex items-start gap-2"><Mail className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span className="break-all">{d.email}</span></p> : null}
      {d.location ? <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span>{d.location}</span></p> : null}
    </div>
    {d.languages ? <p className="mt-2 text-muted-foreground"><span className="font-medium text-foreground">Languages: </span>{d.languages}</p> : null}
    {d.interests ? <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Interests: </span>{d.interests}</p> : null}
    {includeObjective && (d.objective || d.summary) ? <p className="mt-3 whitespace-pre-line"><span className="font-medium">Career objective: </span>{d.objective || d.summary}</p> : null}
    <Source docName={docName} fileId={fileId} page={page} />
  </div>;

  const fields = kind === "education" ? EDUCATION_FIELDS : KINDS.find((k) => k.kind === kind)?.fields ?? [];
  const title = kind === "education" ? d.level || d.institution : d[fields[0]?.key ?? ""];
  const details = kind === "education"
    ? [{ key: "institution", label: "School or institution" }, { key: "field", label: "Field of study" }, { key: "year", label: "Year completed" }]
    : fields.slice(1).filter((f) => f.key !== "objective" && f.key !== "summary");
  return <div className="min-w-0 break-words">
    <p className="font-medium">{title || "—"}</p>
    {details.filter((f) => d[f.key]).map((f) => f.key === "duties" ? <div key={f.key} className="mt-2">
      <p className="font-medium">Duties and achievements</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">{d.duties?.split("\n").filter(Boolean).map((duty, index) => <li key={`${index}-${duty}`}>{duty}</li>)}</ul>
    </div> : <p key={f.key} className="mt-0.5 text-muted-foreground"><span>{f.label}: </span>{d[f.key]}</p>)}
    <Source docName={docName} fileId={fileId} page={page} />
  </div>;
}

function Source({ docName, fileId, page }: { docName: (id: string | null) => string | undefined; fileId: string | null; page: number | null }) {
  const name = docName(fileId);
  return name ? <p className="mt-2 text-xs text-muted-foreground">From {name}{page ? `, page ${page}` : ""}</p> : null;
}

function ObjectiveCard({ views, onEdit }: { views: ViewEntry[]; onEdit: (view: ViewEntry) => void }) {
  const objective = views.map((v) => ({ view: v, text: v.data.objective || v.data.summary })).find((v) => v.text);
  return <Card>
    <CardHeader className="flex flex-row items-center justify-between gap-2"><CardTitle className="text-lg">Career objective</CardTitle>
      {views[0] ? <Button size="sm" variant="outline" onClick={() => onEdit(objective?.view ?? views[0]!)}>{objective ? "Edit" : "Add"}</Button> : null}
    </CardHeader>
    <CardContent>{objective ? <p className="whitespace-pre-line text-sm leading-6">{objective.text}</p>
      : <p className="text-sm text-muted-foreground">{views.length ? "No career objective yet. Select Add to write or paste your objective." : "No career objective yet. Add your personal details first, then add your objective."}</p>}</CardContent>
  </Card>;
}

function EntryForm({ kind, entry, initial, docs, onCancel, onSave }: {
  kind: Kind; entry: Entry | null; initial?: Data; docs: { id: string; original_name: string }[];
  onCancel: () => void; onSave: (d: Data, file: string) => void;
}) {
  const def = KINDS.find((k) => k.kind === kind);
  if (!def) return null;
  const start = initial ?? asData(entry?.draft_data ?? entry?.confirmed_data ?? null);
  const startFile = entry?.draft_file_id ?? entry?.confirmed_file_id ?? "";
  return <div className="rounded-md border border-primary p-4">
    <h3 className="mb-3 font-medium">{entry ? "Edit" : "Add"} — {def.title}</h3>
    <form className="flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget); const data: Data = {};
      for (const { key } of def.fields) {
        const limit = key === "duties" ? 2400 : key === "objective" || key === "summary" ? 1000 : 200;
        const v = String(f.get(key) ?? "").trim().slice(0, limit); if (v) data[key] = v;
      }
      const first = def.fields[0];
      if (!first || !data[first.key]) { toast.error(`${first?.label ?? "Entry"} is required`); return; }
      onSave(data, String(f.get("file") ?? ""));
    }}>
      {def.fields.map((fl) => {
        const multiline = fl.key === "duties" || fl.key === "objective" || fl.key === "summary";
        const maxLength = fl.key === "duties" ? 2400 : multiline ? 1000 : 200;
        return <div key={fl.key} className="flex flex-col gap-1">
          <Label htmlFor={`${kind}-${fl.key}`}>{fl.label}</Label>
          {multiline ? <Textarea id={`${kind}-${fl.key}`} name={fl.key} defaultValue={start[fl.key] ?? ""} maxLength={maxLength} rows={fl.key === "duties" ? 7 : 5} />
            : <Input id={`${kind}-${fl.key}`} name={fl.key} defaultValue={start[fl.key] ?? ""} maxLength={maxLength} />}
        </div>;
      })}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${kind}-file`}>Supporting document (optional)</Label>
        <select id={`${kind}-file`} name="file" defaultValue={startFile} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">None</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.original_name}</option>)}
        </select>
      </div>
      <div className="flex gap-2"><Button type="submit">Save as draft</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  </div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
    <div><Link to="/account" className="text-sm text-primary underline-offset-4 hover:underline">← Your account</Link>
      <h1 className="mt-2 text-2xl font-semibold">My career profile</h1>
      <p className="text-sm text-muted-foreground">Your contact details, objective, education, results, experience and skills. Changes stay as drafts until you confirm them.</p>
    </div>{children}
  </main></div>;
}

function ApsSummary({ entries }: { entries: Entry[] }) {
  const aps = apsScore(entries.filter((e) => !e.draft_remove).map((e) => asData(e.draft_data ?? e.confirmed_data)));
  if (!aps) return null;
  const drafts = entries.some((e) => e.draft_data);
  return <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
    <p className="font-medium">APS score: <span className="text-lg">{aps.score}</span></p>
    <p className="text-muted-foreground">Your {aps.counted.length < 6 ? `${aps.counted.length} marked` : "best 6"} matric subject{aps.counted.length === 1 ? "" : "s"}, Life Orientation left out{drafts ? ", including drafts you have not confirmed yet" : ""}. Universities may calculate it differently.</p>
    {aps.missing.length ? <p className="mt-1 text-muted-foreground">No mark yet for: {aps.missing.join(", ")}. Add the mark with Edit, or accept it from your matric certificate.</p> : null}
  </div>;
}
