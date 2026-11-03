import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Loader2 } from "lucide-react";
import { PasswordInput, PasswordChecklist } from "@/components/PasswordFields";
import { validateRecoveryPassword } from "@/lib/password-recovery";

import { supabase } from "@/integrations/supabase/client";
import { platform } from "@/lib/platform";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AuthSearch = { redirect?: "/account" | "/staff" };

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch =>
    search["redirect"] === "/staff" ? { redirect: "/staff" } : {},
  head: () => ({
    meta: [
      { title: "Sign in or create an account | IDSC" },
      {
        name: "description",
        content:
          "Applicant sign-in and registration for the IDSC Career & Opportunities Portal.",
      },
      { property: "og:title", content: "Sign in | IDSC" },
      {
        property: "og:description",
        content: "Applicant sign-in and registration for the IDSC Career & Opportunities Portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

export function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Incorrect email or password. Please try again.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email address first — check your inbox for the confirmation link.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Please sign in or reset your password.";
  if (m.includes("not allowed"))
    return "This email address cannot be used. Please check it and try again.";
  if (m.includes("password")) return "Password must be at least 8 characters.";
  return "Something went wrong. Please try again.";
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [tab, setTab] = useState("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState(false);

  const destination = redirect ?? "/account";

  async function onForgotPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError(resetError.status === 429
          ? "Too many reset requests. Please wait before trying again."
          : "Could not send the reset email. Please try again.");
      } else {
        // Neutral by design: the same response whether or not the email is
        // registered, so recovery never reveals which addresses have accounts.
        setNotice("If an account exists with this email, password-reset instructions will be sent.");
      }
    } catch { setError("Could not send the reset email. Please check your connection and try again."); }
    finally { setBusy(false); }
  }

  // Already signed in? Go straight to the intended area.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: destination, replace: true });
    });
  }, [navigate, destination]);

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setDuplicateEmail(false);
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(friendlyError(signInError.message));
      return;
    }
    navigate({ to: destination });
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setDuplicateEmail(false);
    const validation = validateRecoveryPassword(password, confirm);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    // Registration creates a customer account only. The database trigger
    // assign_customer_role_on_signup grants exactly the 'customer' role;
    // staff roles can only be added later by a trusted administrator.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (signUpError) {
      // An already-registered email must never look like a successful
      // registration: show the duplicate-account message with recovery links.
      const m = signUpError.message.toLowerCase();
      if (m.includes("user already registered") || m.includes("already been registered")) {
        setDuplicateEmail(true);
      } else {
        setError(friendlyError(signUpError.message));
      }
      return;
    }
    // Obfuscated duplicate: for an existing confirmed address the provider
    // returns a user object with no identities instead of an error. Treat it
    // as a duplicate so no "check your email" notice is shown for an account
    // that will never send one.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setDuplicateEmail(true);
      return;
    }
    if (!data.session) {
      setNotice(
        "Account created. Please check your email and click the confirmation link, then sign in.",
      );
      setTab("sign-in");
      return;
    }
    navigate({ to: "/account" });
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border px-6 py-6 sm:px-12">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link to="/" className="flex items-center gap-3">
            <Building2 aria-hidden="true" className="size-7 text-primary" />
            <span className="text-xl font-bold">{platform.shortName}</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>{forgotPassword ? "Forgot password" : "Sign in"}</CardTitle>
            <CardDescription>
              {forgotPassword ? "Enter your email address to receive a secure password-reset link." : "Sign in to your account, or create a new one with your email address."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {forgotPassword ? (
              <form onSubmit={onForgotPassword} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="reset-email">Email address</Label>
                  <Input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {notice ? <p role="status" className="text-sm text-primary">{notice}</p> : null}
                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}{busy ? "Sending…" : "Send reset link"}</Button>
                <Button type="button" variant="link" disabled={busy} onClick={() => { setForgotPassword(false); setError(null); setNotice(null); }}>Back to sign in</Button>
              </form>
            ) : <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="sign-in">Sign in</TabsTrigger>
                <TabsTrigger value="register">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="sign-in">
                <form onSubmit={onSignIn} className="mt-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="signin-email">Email address</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <PasswordInput
                      id="signin-password"
                      value={password}
                      onChange={setPassword}
                      autoComplete="current-password"
                    />
                    <Button type="button" variant="link" className="h-auto self-start p-0 text-sm" disabled={busy} onClick={() => { setForgotPassword(true); setError(null); setNotice(null); }}>Forgot password?</Button>
                  </div>
                  {notice ? (
                    <p role="status" className="text-sm text-primary">
                      {notice}
                    </p>
                  ) : null}
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
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={onRegister} className="mt-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="register-email">Email address</Label>
                    <Input
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="register-password">Password</Label>
                    <PasswordInput
                      id="register-password"
                      descriptionId="register-password-checklist"
                      value={password}
                      onChange={setPassword}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="register-confirm">Confirm password</Label>
                    <PasswordInput
                      id="register-confirm"
                      descriptionId="register-password-checklist"
                      value={confirm}
                      onChange={setConfirm}
                      autoComplete="new-password"
                    />
                  </div>
                  <PasswordChecklist id="register-password-checklist" password={password} confirmation={confirm} />
                  {duplicateEmail ? (
                    <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      <p className="text-destructive">
                        An account with this email already exists. Please sign in or reset your password.
                      </p>
                      <div className="flex gap-4">
                        <button
                          type="button"
                          className="font-medium text-primary underline-offset-4 hover:underline"
                          onClick={() => { setDuplicateEmail(false); setError(null); setTab("sign-in"); }}
                        >
                          Sign in
                        </button>
                        <button
                          type="button"
                          className="font-medium text-primary underline-offset-4 hover:underline"
                          onClick={() => { setDuplicateEmail(false); setError(null); setForgotPassword(true); }}
                        >
                          Reset your password
                        </button>
                      </div>
                    </div>
                  ) : error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button type="submit" disabled={busy || validateRecoveryPassword(password, confirm) !== null}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {busy ? "Creating account…" : "Create account"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Registration creates an applicant account. Staff accounts are created
                    by the centre's administrator and cannot be requested here.
                  </p>
                </form>
              </TabsContent>
            </Tabs>}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
