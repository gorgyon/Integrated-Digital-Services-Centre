import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { platform } from "@/lib/platform";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IDSC — In preparation" },
      { name: "description", content: "IDSC. Our digital platform is in preparation." },
      { property: "og:title", content: "IDSC — In preparation" },
      { property: "og:description", content: "Our digital platform is in preparation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, loading } = useSession();
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border px-6 py-6 sm:px-12">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Building2 aria-hidden="true" className="size-7 text-primary" />
          <span className="text-xl font-bold">{platform.shortName}</span>
          <nav className="ml-auto flex items-center gap-4 text-sm">
            {loading ? null : session ? (
              <Link to="/account" className="font-medium text-primary underline-offset-4 hover:underline">
                My account
              </Link>
            ) : (
              <>
                <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
                  Sign in
                </Link>
                <Link to="/staff/sign-in" className="text-muted-foreground underline-offset-4 hover:underline">
                  Staff
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-24 sm:px-12">
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">{platform.shortName}</h1>
        <div className="my-10 h-1 w-16 bg-primary" />
        <p className="text-xl font-medium">Our digital platform is in preparation.</p>
        <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">Online services are not available yet.</p>
      </main>
      <footer className="border-t border-border px-6 py-6 sm:px-12">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 text-sm text-muted-foreground">
          <span>{platform.shortName}</span>
          <span>In preparation</span>
        </div>
      </footer>
    </div>
  );
}
