import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AlertTriangle, ArrowLeft, Search, UserPlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/staff/guests")({
  head: () => ({
    meta: [
      { title: "Guest customer intake — IDSC staff" },
      { name: "description", content: "Front-desk intake of walk-in guest customers." },
      { property: "og:title", content: "Guest customer intake — IDSC staff" },
      { property: "og:description", content: "Front-desk intake of walk-in guest customers." },
    ],
  }),
  component: GuestIntakePage,
});

type Profile = { id: string; full_name: string; phone: string; email: string | null; is_guest: boolean };
type Duplicate = Profile & { matched_on: string };

const contactSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the customer's full name.").max(120, "Full name must be 120 characters or fewer."),
  phone: z
    .string()
    .trim()
    .max(30, "Phone number is too long.")
    .refine((v) => {
      const digits = v.replace(/\D/g, "").length;
      return digits >= 7 && digits <= 15;
    }, "Enter a valid phone number (7 to 15 digits)."),
  email: z
    .string()
    .trim()
    .max(255, "Email must be 255 characters or fewer.")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address, or leave it blank."),
});
type Contact = z.infer<typeof contactSchema>;
const empty: Contact = { full_name: "", phone: "", email: "" };

function friendlyError(message: string) {
  if (/not authorised|permission denied|row-level/i.test(message)) return "You do not have front-desk permission for this action.";
  if (/duplicate review required/i.test(message)) return "Possible duplicates changed. Please review them again.";
  if (/invalid/i.test(message)) return "Some details are not valid. Please check the form.";
  return "Something went wrong. Please try again.";
}

function TypeBadge({ guest }: { guest: boolean }) {
  return guest ? <Badge variant="outline">Guest record</Badge> : <Badge>Registered account</Badge>;
}

function ContactFields({ value, onChange, errors, idPrefix }: { value: Contact; onChange: (v: Contact) => void; errors: Partial<Record<keyof Contact, string>>; idPrefix: string }) {
  const field = (key: keyof Contact, label: string, type = "text", hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
      <Input id={`${idPrefix}-${key}`} type={type} value={value[key]} aria-invalid={!!errors[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })} />
      {errors[key] ? <p className="text-sm text-destructive">{errors[key]}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {field("full_name", "Full name (required)")}
      {field("phone", "Phone number (required)", "tel")}
      {field("email", "Email address (optional)", "email", "May be left blank.")}
    </div>
  );
}

function validate(v: Contact) {
  const r = contactSchema.safeParse(v);
  if (r.success) return { data: r.data, errors: {} };
  const errors: Partial<Record<keyof Contact, string>> = {};
  for (const issue of r.error.issues) errors[issue.path[0] as keyof Contact] ??= issue.message;
  return { data: null, errors };
}

function GuestIntakePage() {
  const { staffRoles } = Route.useRouteContext();
  const isFrontDesk = staffRoles.includes("front_desk");

  if (!isFrontDesk) {
    return (
      <Shell>
        <Alert>
          <AlertTitle>Front-desk access required</AlertTitle>
          <AlertDescription>Guest intake is available only to staff with the front-desk role.</AlertDescription>
        </Alert>
      </Shell>
    );
  }
  return (
    <Shell>
      <CreateGuest />
      <SearchCustomers />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border px-6 py-5 sm:px-12">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link to="/staff" className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="size-4" aria-hidden="true" /> Staff area
          </Link>
          <h1 className="ml-auto text-lg font-semibold">Guest customer intake</h1>
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">{children}</main>
    </div>
  );
}

function CreateGuest() {
  const [form, setForm] = useState<Contact>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof Contact, string>>>({});
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const change = (v: Contact) => { setForm(v); setDuplicates(null); setMessage(null); };

  async function create(reviewed: string[]) {
    const { data } = validate(form);
    if (!data) return;
    const { error } = await supabase.rpc("create_guest_customer", {
      _full_name: data.full_name, _phone: data.phone, _email: data.email || null, _reviewed_duplicates: reviewed,
    });
    if (error) {
      setMessage({ kind: "error", text: friendlyError(error.message) });
      if (/duplicate review/i.test(error.message)) setDuplicates(null);
      return;
    }
    setForm(empty); setDuplicates(null);
    setMessage({ kind: "ok", text: `Guest record created for ${data.full_name}.` });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const { data, errors } = validate(form);
    setErrors(errors);
    if (!data) return;
    setBusy(true);
    try {
      const { data: found, error } = await supabase.rpc("find_possible_duplicate_customers", { _phone: data.phone, _email: data.email });
      if (error) { setMessage({ kind: "error", text: friendlyError(error.message) }); return; }
      if (found && found.length > 0) { setDuplicates(found as Duplicate[]); return; }
      await create([]);
    } finally { setBusy(false); }
  }

  async function proceed() {
    if (!duplicates) return;
    setBusy(true);
    try { await create(duplicates.map((d) => d.id)); } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserPlus className="size-5" aria-hidden="true" /> New guest customer</CardTitle>
        <CardDescription>For walk-in customers who have not registered. Do not ask for an identity number.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <ContactFields value={form} onChange={change} errors={errors} idPrefix="new" />
          {duplicates ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>Possible existing customer — please review</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>These records share a phone number or email. Sharing contact details does not mean it is the same person. Nothing will be merged or changed.</p>
                <ul className="flex flex-col gap-2">
                  {duplicates.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-foreground">
                      <span className="font-medium">{d.full_name}</span>
                      <span>{d.phone}</span>
                      {d.email ? <span>{d.email}</span> : null}
                      <TypeBadge guest={d.is_guest} />
                      <Badge variant="secondary">Matches {d.matched_on.replace(",", " and ")}</Badge>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={proceed} disabled={busy}>Reviewed — create a separate guest record</Button>
                  <Button type="button" variant="outline" onClick={() => setDuplicates(null)} disabled={busy}>Cancel</Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <div><Button type="submit" disabled={busy}>{busy ? "Checking…" : "Check and create guest record"}</Button></div>
          )}
          {message ? (
            <p role="status" className={message.kind === "ok" ? "text-sm font-medium text-primary" : "text-sm text-destructive"}>{message.text}</p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function SearchCustomers() {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const t = term.trim().slice(0, 100);
    if (t.length < 2) { setError("Enter at least 2 characters of a name, phone number or email."); return; }
    const safe = t.replace(/[%_,()\\]/g, "");
    const digits = t.replace(/\D/g, "");
    const filters = [`full_name.ilike.%${safe}%`, `email.ilike.%${safe}%`, `phone.ilike.%${safe}%`];
    if (digits.length >= 3 && digits !== safe) filters.push(`phone.ilike.%${digits}%`);
    const { data, error } = await supabase.from("customer_profiles")
      .select("id,full_name,phone,email,is_guest").or(filters.join(",")).order("full_name").limit(25);
    if (error) { setError(friendlyError(error.message)); return; }
    setResults(data);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Search className="size-5" aria-hidden="true" /> Find a customer</CardTitle>
        <CardDescription>Search by name, phone number or email.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={search} className="flex gap-2">
          <Input aria-label="Search customers" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. 071 234 5678" />
          <Button type="submit">Search</Button>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {results && results.length === 0 ? <p className="text-sm text-muted-foreground">No matching customers.</p> : null}
        <ul className="flex flex-col gap-2">
          {results?.map((p) => (
            <li key={p.id} className="rounded-md border border-border p-3">
              {editing === p.id ? (
                <EditContact profile={p} onDone={(updated) => {
                  setEditing(null);
                  if (updated) setResults((rs) => rs?.map((r) => (r.id === updated.id ? updated : r)) ?? null);
                }} />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{p.full_name}</span>
                  <span className="text-sm">{p.phone}</span>
                  <span className="text-sm text-muted-foreground">{p.email ?? "No email"}</span>
                  <TypeBadge guest={p.is_guest} />
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditing(p.id)}>Correct contact details</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function EditContact({ profile, onDone }: { profile: Profile; onDone: (p: Profile | null) => void }) {
  const [form, setForm] = useState<Contact>({ full_name: profile.full_name, phone: profile.phone, email: profile.email ?? "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Contact, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(form);
    setErrors(errors);
    if (!data) return;
    setBusy(true);
    const { data: row, error } = await supabase.from("customer_profiles")
      .update({ full_name: data.full_name, phone: data.phone, email: data.email || null })
      .eq("id", profile.id).select("id,full_name,phone,email,is_guest").maybeSingle();
    setBusy(false);
    if (error || !row) { setFailure(friendlyError(error?.message ?? "not authorised")); return; }
    onDone(row);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3" noValidate>
      <ContactFields value={form} onChange={setForm} errors={errors} idPrefix={`edit-${profile.id}`} />
      {failure ? <p className="text-sm text-destructive">{failure}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>Save correction</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onDone(null)}>Cancel</Button>
      </div>
    </form>
  );
}
