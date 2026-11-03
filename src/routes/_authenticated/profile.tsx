import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My career profile | IDSC" },
      { name: "description", content: "Your education, qualifications, results and skills." },
      { property: "og:title", content: "My career profile | IDSC" },
      { property: "og:description", content: "Your education, qualifications, results and skills." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

type Kind = Database["public"]["Enums"]["career_entry_kind"];
type Entry = Database["public"]["Tables"]["career_profile_entries"]["Row"];
type Data = Record<string, string>;

const KINDS: { kind: Kind; title: string; fields: { key: string; label: string }[] }[] = [
  { kind: "education", title: "Education", fields: [
    { key: "institution", label: "School or institution" }, { key: "level", label: "Level (e.g. Grade 12, Diploma)" },
    { key: "field", label: "Field of study" }, { key: "year", label: "Year completed" } ] },
  { kind: "qualification", title: "Qualifications", fields: [
    { key: "title", label: "Qualification" }, { key: "issuer", label: "Issued by" }, { key: "field", label: "Field of study" }, { key: "year", label: "Year" } ] },
  { kind: "result", title: "Academic results", fields: [
    { key: "subject", label: "Subject" }, { key: "grade", label: "Mark or grade" }, { key: "year", label: "Year" } ] },
  { kind: "skill", title: "Skills", fields: [
    { key: "name", label: "Skill" }, { key: "level", label: "Level (e.g. Beginner, Advanced)" } ] },
  { kind: "experience", title: "Employment history and experience", fields: [
    { key: "role", label: "Role or experience" }, { key: "employer", label: "Employer" }, { key: "period", label: "Dates" } ] },
];

const asData = (j: Json | null): Data => (j && typeof j === "object" && !Array.isArray(j) ? (j as Data) : {});
const summary = (k: Kind, d: Data) =>
  KINDS.find((x) => x.kind === k)?.fields.map((f) => d[f.key]).filter(Boolean).join(" · ") || "—";

function ProfilePage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ kind: Kind; entry: Entry | null } | null>(null);

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

  const pending = (entries.data ?? []).filter((e) => e.draft_data || e.draft_remove);

  if (entries.isError)
    return <Shell><p className="text-sm text-muted-foreground">Please create your applicant details on the <Link to="/documents" className="text-primary underline">My documents</Link> page first.</p></Shell>;

  return (
    <Shell>
      {pending.length > 0 ? (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Review and confirm</CardTitle>
            <CardDescription>These changes are drafts. They are not part of your profile until you confirm them.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pending.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div>
                  <Badge variant="secondary" className="mr-2">{KINDS.find((k) => k.kind === e.kind)?.title}</Badge>
                  {e.draft_remove ? <span>Remove: {summary(e.kind, asData(e.confirmed_data))}</span> : (
                    <span>
                      {e.confirmed_data ? "Change to: " : "New: "}{summary(e.kind, asData(e.draft_data))}
                      {docName(e.draft_file_id) ? ` (document: ${docName(e.draft_file_id)}${e.draft_source_page ? `, page ${e.draft_source_page}` : ""})` : ""}
                    </span>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => run(supabase.rpc("discard_career_draft", { _entry: e.id }), "Draft discarded")}>Discard</Button>
              </div>
            ))}
            <Button onClick={() => run(supabase.rpc("confirm_career_profile"), "Profile confirmed")}>Confirm all changes</Button>
          </CardContent>
        </Card>
      ) : null}

      {KINDS.map(({ kind, title }) => {
        const list = (entries.data ?? []).filter((e) => e.kind === kind);
        const formHere = editing?.kind === kind;
        return (
          <Card key={kind}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg">{title}</CardTitle>
              <Button size="sm" variant="outline" disabled={formHere && !editing?.entry} onClick={() => setEditing({ kind, entry: null })}>Add</Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {formHere ? (
                <EntryForm key={editing.entry?.id ?? `new-${kind}`} {...editing} docs={docs.data ?? []}
                  onCancel={() => setEditing(null)}
                  onSave={async (data, file) => {
                    const { error } = await supabase.rpc("save_career_draft", {
                      _entry: editing.entry?.id ?? (null as unknown as string), _kind: kind, _data: data, _file: (file || null) as unknown as string,
                    });
                    if (error) { toast.error(error.message); return; }
                    toast.success("Saved as draft");
                    setEditing(null); refresh();
                  }} />
              ) : null}
              {list.length === 0 && !formHere ? <p className="text-sm text-muted-foreground">No entries yet.</p> : list.map((e) => {
                const isDraft = !!e.draft_data || e.draft_remove;
                const shown = asData(e.draft_data ?? e.confirmed_data);
                const fileId = e.draft_data ? e.draft_file_id : e.confirmed_file_id;
                const page = e.draft_data ? e.draft_source_page : e.confirmed_source_page;
                return (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words">
                      {isDraft ? <Badge variant="secondary" className="mr-2">{e.draft_remove ? "Removal draft" : "Draft"}</Badge> : null}
                      {summary(kind, shown)}
                      {docName(fileId) ? <span className="text-muted-foreground"> · {docName(fileId)}{page ? `, page ${page}` : ""}</span> : null}
                    </span>
                    <span className="flex gap-1">
                      {!e.draft_remove ? <Button size="sm" variant="ghost" onClick={() => setEditing({ kind, entry: e })}>Edit</Button> : null}
                      {isDraft
                        ? <Button size="sm" variant="ghost" onClick={() => run(supabase.rpc("discard_career_draft", { _entry: e.id }), e.confirmed_data ? "Draft discarded" : "Draft removed")}>{e.confirmed_data ? "Discard draft" : "Remove"}</Button>
                        : <Button size="sm" variant="ghost" onClick={() => run(supabase.rpc("request_career_entry_removal", { _entry: e.id }), "Removal added for review")}>Remove</Button>}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </Shell>
  );
}

function EntryForm({ kind, entry, docs, onCancel, onSave }: {
  kind: Kind; entry: Entry | null; docs: { id: string; original_name: string }[];
  onCancel: () => void; onSave: (d: Data, file: string) => void;
}) {
  const def = KINDS.find((k) => k.kind === kind);
  if (!def) return null;
  const start = asData(entry?.draft_data ?? entry?.confirmed_data ?? null);
  const startFile = entry?.draft_file_id ?? entry?.confirmed_file_id ?? "";
  return (
    <div className="rounded-md border border-primary p-4">
      <h3 className="mb-3 font-medium">{entry ? "Edit" : "Add"} — {def.title}</h3>
      <div>
        <form className="flex flex-col gap-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const data: Data = {};
          for (const { key } of def.fields) { const v = String(f.get(key) ?? "").trim().slice(0, 200); if (v) data[key] = v; }
          const first = def.fields[0];
          if (!first || !data[first.key]) { toast.error(`${first?.label ?? "Entry"} is required`); return; }
          onSave(data, String(f.get("file") ?? ""));
        }}>
          {def.fields.map((fl) => (
            <div key={fl.key} className="flex flex-col gap-1">
              <Label htmlFor={`${kind}-${fl.key}`}>{fl.label}</Label>
              <Input id={`${kind}-${fl.key}`} name={fl.key} defaultValue={start[fl.key] ?? ""} maxLength={200} />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${kind}-file`}>Supporting document (optional)</Label>
            <select id={`${kind}-file`} name="file" defaultValue={startFile} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">None</option>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.original_name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Save as draft</Button>
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <div>
          <Link to="/account" className="text-sm text-primary underline-offset-4 hover:underline">← Your account</Link>
          <h1 className="mt-2 text-2xl font-semibold">My career profile</h1>
          <p className="text-sm text-muted-foreground">Enter your education, qualifications, results and skills. Changes are saved as drafts until you confirm them.</p>
        </div>
        {children}
      </main>
    </div>
  );
}
