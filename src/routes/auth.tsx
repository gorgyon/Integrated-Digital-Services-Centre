import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";

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
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect: search["redirect"] === "/staff" ? "/staff" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in or create an account | IDSC" },
      {
        name: "description",
        content:
          "Customer sign-in and registration for the Integrated Digital Services Centre, Mentz Segoreng Village.",
      },
      { property: "og:title", content: "Sign in | IDSC" },
      {
        property: "og:description",
        content: "Customer sign-in and registration for the Integrated Digital Services Centre.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Incorrect email or password. Please try again.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email address first — check your inbox for the confirmation link.";
  if (m.includes("user already registered"))
    return "An account with this email already exists. Try signing in instead.";
  if (m.includes("password")) return "Password must be at least 8 characters.";
  return "Something went wrong. Please try again.";
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
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
  );
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const destination = redirect ?? "/account";

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
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
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
      setError(friendlyError(signUpError.message));
      return;
    }
    if (!data.session) {
      setNotice(
        "Account created. Please check your email and click the confirmation link, then sign in.",
      );
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
          <span className="ml-auto text-sm text-muted-foreground">{platform.location}</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Customer account</CardTitle>
            <CardDescription>
              Sign in to your account, or create one with your email address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="sign-in">
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
                      value={password}
                      onChange={setPassword}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="register-confirm">Confirm password</Label>
                    <PasswordInput
                      id="register-confirm"
                      value={confirm}
                      onChange={setConfirm}
                      autoComplete="new-password"
                    />
                  </div>
                  {error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button type="submit" disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {busy ? "Creating account…" : "Create account"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Registration creates a customer account. Staff accounts are created
                    by the centre's administrator and cannot be requested here.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Centre staff?{" "}
          <Link to="/staff/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
            Use the staff sign-in
          </Link>
        </p>
      </main>
    </div>
  );
}
