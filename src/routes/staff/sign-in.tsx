import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { platform } from "@/lib/platform";
import { isStaffRole } from "@/lib/auth";
import { getMyRoles } from "@/server/auth.functions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/staff/sign-in")({
  head: () => ({
    meta: [
      { title: "Staff sign in | IDSC" },
      {
        name: "description",
        content:
          "Staff sign-in for the Integrated Digital Services Centre, Mentz Segoreng Village.",
      },
      { property: "og:title", content: "Staff sign in | IDSC" },
      {
        property: "og:description",
        content: "Staff sign-in for the Integrated Digital Services Centre.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffSignInPage,
});

function StaffSignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setBusy(false);
      setError("Incorrect email or password. Please try again.");
      return;
    }
    // Roles come from the database, not from anything the browser sent.
    // An account without a staff role is signed straight back out.
    try {
      const { roles } = await getMyRoles();
      if (!roles.some(isStaffRole)) {
        await supabase.auth.signOut();
        setBusy(false);
        setError(
          "This account is not authorised for staff access. Staff accounts are created by the centre's administrator.",
        );
        return;
      }
    } catch {
      await supabase.auth.signOut();
      setBusy(false);
      setError("Could not verify your staff access. Please try again.");
      return;
    }
    navigate({ to: "/staff" });
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border px-6 py-6 sm:px-12">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link to="/" className="flex items-center gap-3">
            <Building2 aria-hidden="true" className="size-7 text-primary" />
            <span className="text-xl font-bold">{platform.shortName}</span>
          </Link>
          <span className="ml-auto text-sm text-muted-foreground">{platform.location}</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Card>
          <CardHeader>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <ShieldCheck aria-hidden="true" className="size-5" />
              <span className="text-sm font-semibold uppercase">Staff only</span>
            </div>
            <CardTitle>Staff sign in</CardTitle>
            <CardDescription>
              For authorised centre staff. There is no public staff registration —
              accounts are created by the administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="staff-email">Work email address</Label>
                <Input
                  id="staff-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="staff-password">Password</Label>
                <div className="relative">
                  <Input
                    id="staff-password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Not staff?{" "}
          <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
            Use the customer sign-in
          </Link>
        </p>
      </main>
    </div>
  );
}
