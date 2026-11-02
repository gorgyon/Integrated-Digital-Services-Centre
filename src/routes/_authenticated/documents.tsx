import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { platform } from "@/lib/platform";
import { deleteCareerDocument, downloadCareerDocument } from "@/lib/career-documents.functions";
import { SignOutButton } from "@/components/SignOutButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "My documents | IDSC" }] }),
  component: DocumentsPage,
});

const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

function formatSize(n: number | null) {
  if (!n) return "";
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentsPage() {
  const { session } = useSession();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const profile = useQuery({
    queryKey: ["my-customer-profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_profiles")
        .select("id")
        .eq("user_id", session!.user.id)
        .maybeSingle();
      return data;
    },
  });
  const docs = useQuery({
    queryKey: ["my-career-documents"],
    enabled: !!profile.data,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_career_documents");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function createProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.rpc("create_my_customer_profile", {
      _full_name: String(f.get("full_name") ?? ""),
      _phone: String(f.get("phone") ?? ""),
    });
    setBusy(false);
    if (error) { toast.error("Please enter your full name and a valid phone number."); return; }
    qc.invalidateQueries({ queryKey: ["my-customer-profile"] });
  }

  async function upload(file: File) {
    if (!ALLOWED.includes(file.type)) { toast.error("Only PDF, JPG and PNG files are allowed."); return; }
    if (file.size > MAX_BYTES) { toast.error("Files must be 10 MB or smaller."); return; }
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const path = `${session!.user.id}/${crypto.randomUUID()}.${ext}`;
    setBusy(true);
    const { error: upErr } = await supabase.storage
      .from("career-documents")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setBusy(false);
      toast.error("Upload failed. Please try again.");
      return;
    }
    const { error } = await supabase.rpc("register_career_document", {
      _path: path,
      _original_name: file.name,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Document uploaded.");
    qc.invalidateQueries({ queryKey: ["my-career-documents"] });
  }

  async function view(id: string) {
    try {
      const r = await downloadCareerDocument({ data: { fileId: id } });
      const bin = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bin], { type: r.mimeType }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("Could not open the document.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this document?")) return;
    try {
      await deleteCareerDocument({ data: { fileId: id } });
      toast.success("Document removed.");
      qc.invalidateQueries({ queryKey: ["my-career-documents"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the document.");
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border px-6 py-6 sm:px-12">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link to="/" className="flex items-center gap-3">
            <Building2 aria-hidden="true" className="size-7 text-primary" />
            <span className="text-xl font-bold">{platform.shortName}</span>
          </Link>
          <span className="ml-auto flex items-center gap-3">
            <Link to="/account" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              My account
            </Link>
            <SignOutButton />
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>My documents</CardTitle>
            <CardDescription>
              Private certificates, transcripts and CVs. Only you can see them. PDF, JPG or PNG, up to 10 MB each.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {profile.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !profile.data ? (
              <form onSubmit={createProfile} className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">Before uploading, tell us your name and phone number.</p>
                <div className="grid gap-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input id="full_name" name="full_name" required minLength={2} maxLength={120} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input id="phone" name="phone" type="tel" required maxLength={30} />
                </div>
                <Button type="submit" disabled={busy}>Continue</Button>
              </form>
            ) : (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void upload(f);
                  }}
                />
                <Button onClick={() => inputRef.current?.click()} disabled={busy} className="self-start">
                  <Upload aria-hidden="true" /> {busy ? "Uploading…" : "Upload document"}
                </Button>
                {docs.data && docs.data.length > 0 ? (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {docs.data.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 p-3">
                        <FileText aria-hidden="true" className="size-5 shrink-0 text-primary" />
                        <button onClick={() => view(d.id)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate font-medium underline-offset-4 hover:underline">{d.original_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(d.created_at).toLocaleDateString("en-ZA")} · {formatSize(d.size_bytes)}
                          </span>
                        </button>
                        <Button variant="ghost" size="icon" aria-label={`Remove ${d.original_name}`} onClick={() => remove(d.id)}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
