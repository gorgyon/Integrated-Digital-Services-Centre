<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Platform boundaries

- Keep the TanStack file-based bootstrap and an explicit edge-compatible deployment target; this preserves one deployable codebase inside and outside Lovable.
- Shared browser-safe platform identity belongs in `src/lib/platform.ts`; future business modules belong in separate `src/modules/<domain>/` directories and must reuse shared services, keeping orders and employment applications separate.
- Deployment and backup tooling stays outside application imports in `scripts/` and `docs/`; it may use local Node APIs without putting unsupported APIs into the edge runtime.
- M02 creates no data/storage clients or business entities; provider activation and operational backup automation require their approved later milestone.
- Security uses database-enforced scoped assignments and customer-approved, expiring file grants; authenticated file reads must use the audited RPC, never direct table reads or unlogged signed URLs, so API callers cannot bypass purpose checks.
- Role changes use audited administrator RPCs, deny self-modification and admin promotion, and leave first-admin/employer bootstrap to a trusted operator; ordinary table writes must not enable escalation.
- Permission regression tests reconstruct the migrations in isolated PostgreSQL (PGlite), using actual database roles rather than mocked predicates; this keeps destructive test fixtures out of the live database.
- Server functions live in `src/lib/*.functions.ts`, never `src/server/**` — the Vite import-protection plugin denies client-graph imports from `src/server/`, which breaks the whole client bundle.
- Self-registration grants only the `customer` role via the `assign_customer_role_on_signup` trigger on `auth.users`; staff roles are added only through the audited admin RPC, and role-aware routing reads roles from the `getMyRoles` server function, never from browser-submitted values.
