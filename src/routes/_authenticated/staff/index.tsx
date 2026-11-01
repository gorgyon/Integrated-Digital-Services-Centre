import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

import { useSession } from "@/lib/auth";
import { platform } from "@/lib/platform";
import { SignOutButton } from "@/components/SignOutButton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/staff/")({
  component: StaffHomePage,
});

function StaffHomePage() {
  const { session } = useSession();
  const { staffRoles } = Route.useRouteContext();

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border px-6 py-6 sm:px-12">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link to="/" className="flex items-center gap-3">
            <Building2 aria-hidden="true" className="size-7 text-primary" />
            <span className="text-xl font-bold">{platform.shortName}</span>
          </Link>
          <span className="ml-auto flex items-center gap-3">
            <Link
              to="/account"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              My account
            </Link>
            <SignOutButton />
          </span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Staff area</CardTitle>
            <CardDescription>
              Signed in as {session?.user.email ?? "…"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Staff roles</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {staffRoles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {role.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Staff tools are still in preparation. Your access is limited to the
              roles above, assigned by the administrator.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
