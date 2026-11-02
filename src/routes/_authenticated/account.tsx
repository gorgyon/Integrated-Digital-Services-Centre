import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";

import { useSession, isStaffRole } from "@/lib/auth";
import { platform } from "@/lib/platform";
import { getMyRoles } from "@/lib/auth.functions";
import { SignOutButton } from "@/components/SignOutButton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  const { session } = useSession();
  const { data } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => getMyRoles(),
  });
  const roles = data?.roles ?? [];
  const staff = roles.some(isStaffRole);

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border px-6 py-6 sm:px-12">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link to="/" className="flex items-center gap-3">
            <Building2 aria-hidden="true" className="size-7 text-primary" />
            <span className="text-xl font-bold">{platform.shortName}</span>
          </Link>
          <span className="ml-auto flex items-center gap-3">
            {staff ? (
              <Link
                to="/staff"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Staff area
              </Link>
            ) : null}
            <SignOutButton />
          </span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Your account</CardTitle>
            <CardDescription>
              You are signed in to the {platform.name}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email address</p>
              <p className="mt-1">{session?.user.email ?? "…"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Access</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {roles.length > 0 ? (
                  roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {role.replace(/_/g, " ")}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="secondary">customer</Badge>
                )}
              </div>
            </div>
            <Link to="/documents" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              My documents
            </Link>
            <p className="text-sm text-muted-foreground">
              Online services are still in preparation. When they open, your orders,
              applications and documents will appear here.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
