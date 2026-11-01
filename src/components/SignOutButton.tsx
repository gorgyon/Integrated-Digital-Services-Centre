import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

import { useSignOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const signOut = useSignOut();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
      }}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
