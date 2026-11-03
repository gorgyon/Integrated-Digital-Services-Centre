import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled collection entry point. Only the managed scheduler can call it. */
export const Route = createFileRoute("/api/public/jobs/collect-opportunities")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { collectDueSources } = await import("@/lib/opportunities/collector");
        try {
          return Response.json(await collectDueSources(supabaseAdmin));
        } catch (e) {
          console.error("Opportunity collection failed:", e);
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
