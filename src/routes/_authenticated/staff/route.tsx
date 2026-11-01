import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { isStaffRole } from "@/lib/auth";
import { getMyRoles } from "@/lib/auth.functions";

/**
 * Staff role gate. Runs after the _authenticated session gate, so the caller
 * is signed in; roles come from user_roles via the trusted server function.
 * Accounts without a staff role are sent back to the customer account page.
 */
export const Route = createFileRoute("/_authenticated/staff")({
  beforeLoad: async () => {
    const { roles } = await getMyRoles();
    if (!roles.some(isStaffRole)) {
      throw redirect({ to: "/account" });
    }
    return { staffRoles: roles.filter(isStaffRole) };
  },
  component: () => <Outlet />,
});
