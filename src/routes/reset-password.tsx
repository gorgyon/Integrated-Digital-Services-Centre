import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { platform } from "@/lib/platform";
import { validateRecoveryPassword } from "@/lib/password-recovery";
import { PasswordInput, PasswordChecklist } from "@/components/PasswordFields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Reset password | IDSC" },
    { name: "description", content: "Securely reset your IDSC Career & Opportunities Portal password." },
    { property: "og:title", content: "Reset password | IDSC" },
    { property: "og:description", content: "Securely reset your Career & Opportunities Portal password." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<"checking" | "valid" | "invalid" | "success">("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const recoveryLink = hash.get("type") === "recovery";
    const invalidLink = hash.has("error") || new URLSearchParams(window.location.search).has("error");
    let receivedRecovery = false;
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && active) {
        receivedRecovery = true;
        sessionStorage.setItem("idsc-password-recovery", "active");
        setState("valid");
      }
    });
    async function check() {
      // Wait for the provider to consume and verify tokens from the recovery URL.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const candidate = recoveryLink || receivedRecovery || sessionStorage.getItem("idsc-password-recovery") === "active";
      if (invalidLink || sessionError || !sessionData.session || !candidate) {
        if (active) setState("invalid");
        return;
      }
      const { data, error: userError } = await supabase.auth.getUser();
      if (!active) return;
      if (userError || !data.user) { setState("invalid"); return; }
      sessionStorage.setItem("idsc-password-recovery", "active");
      setState("valid");
    }
    void check().catch(() => { if (active) setState("invalid"); });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validateRecoveryPassword(password, confirmation);
    setError(validation);
    if (validation || state !== "valid") return;
    setBusy(true);
    try {
      // Recovery sessions do not require the old password.
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        if (updateError.status === 401 || updateError.status === 403) {
          sessionStorage.removeItem("idsc-password-recovery");
          setState("invalid");
        } else {
          setError(updateError.code === "same_password"
            ? "Choose a password different from your previous password."
            : "Could not reset your password. Use a stronger password or request a new reset link.");
        }
        return;
      }
      sessionStorage.removeItem("idsc-password-recovery");
      setPassword("");
      setConfirmation("");
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      setState("success");
    } catch {
      setError("Could not reset your password. Please check your connection and try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border px-6 py-6 sm:px-12">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link to="/" className="flex items-center gap-3"><Building2 aria-hidden="true" className="size-7 text-primary" /><span className="text-xl font-bold">{platform.shortName}</span></Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Card>
          <CardHeader><CardTitle>Reset password</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {state === "checking" ? <p role="status" className="text-sm text-muted-foreground">Checking your reset link…</p> : null}
            {state === "invalid" ? <p role="alert" className="text-sm text-destructive">This reset link is invalid or has expired. Return to sign in and select “Forgot password?” to request a new link.</p> : null}
            {state === "success" ? <p role="status" className="text-sm text-primary">Your password has been reset. You can now sign in with your new password.</p> : null}
            {state === "valid" ? (
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2"><Label htmlFor="new-password">New password</Label><PasswordInput id="new-password" descriptionId="reset-password-checklist" autoComplete="new-password" value={password} onChange={setPassword} /></div>
                <div className="flex flex-col gap-2"><Label htmlFor="confirm-password">Confirm new password</Label><PasswordInput id="confirm-password" descriptionId="reset-password-checklist" autoComplete="new-password" value={confirmation} onChange={setConfirmation} /></div>
                <PasswordChecklist id="reset-password-checklist" password={password} confirmation={confirmation} />
                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" disabled={busy || validateRecoveryPassword(password, confirmation) !== null}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}{busy ? "Resetting password…" : "Reset password"}</Button>
              </form>
            ) : null}
            <Link to="/auth" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Back to sign in</Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}