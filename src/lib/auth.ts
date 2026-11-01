/** Browser-safe authentication helpers. Roles always come from the database
 *  (user_roles) through a server function — never from browser-submitted values. */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/** Roles that count as centre staff. `employer` and `customer` are not staff. */
export const STAFF_ROLES = [
  "admin",
  "front_desk",
  "designer",
  "print_operator",
  "career_support",
  "finance",
] as const;

export function isStaffRole(role: string): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/** Current session, hydrated after mount so server and first client render agree. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

/** Secure sign-out: stop in-flight queries, drop cached protected data, clear the
 *  session, then replace history so Back cannot restore a protected page. */
export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}
