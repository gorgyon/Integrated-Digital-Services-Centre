import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

/**
 * Integration-managed gate for the whole authenticated subtree.
 * Client-only (ssr: false) because the session lives in browser storage;
 * getUser() re-validates with the auth server before any child loader runs.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.pathname },
      });
    }
  },
  component: () => <Outlet />,
});
