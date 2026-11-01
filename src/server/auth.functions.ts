import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Trusted role lookup: reads the caller's roles from user_roles as themselves
 * (RLS allows users to read only their own role rows). Role-aware routing and
 * access decisions must use this — never browser-submitted role values.
 */
export const getMyRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not load roles");
    return { roles: (data ?? []).map((r) => r.role as string) };
  });
