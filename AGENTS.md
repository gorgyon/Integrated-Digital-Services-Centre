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
- Document reading runs lazily in the applicant browser using bundled PDF.js/Tesseract assets; owner-only readings are persisted through audited RPCs, suggestions become source-linked C2 drafts only, and run tokens/cache prevent repeated processing. This keeps OCR private and avoids unsupported server-native libraries or paid services.
- Password creation and reset share browser-safe policy helpers and password field/checklist components; this prevents validation and presentation drift without imposing new rules on existing sign-in passwords.

- Password recovery uses the existing Cloud Auth client and a public `/reset-password` route; validate recovery sessions with the provider before changing passwords so ordinary signed-in visits do not become reset flows.

- Keep the TanStack file-based bootstrap and an explicit edge-compatible deployment target; this preserves one deployable codebase inside and outside Lovable.
- Shared browser-safe platform identity belongs in `src/lib/platform.ts`; future business modules belong in separate `src/modules/<domain>/` directories and must reuse shared services, keeping orders and employment applications separate.
- Deployment and backup tooling stays outside application imports in `scripts/` and `docs/`; it may use local Node APIs without putting unsupported APIs into the edge runtime.
- M02 creates no data/storage clients or business entities; provider activation and operational backup automation require their approved later milestone.
- Security uses database-enforced scoped assignments and customer-approved, expiring file grants; authenticated file reads must use the audited RPC, never direct table reads or unlogged signed URLs, so API callers cannot bypass purpose checks.
- Role changes use audited administrator RPCs, deny self-modification and admin promotion, and leave first-admin/employer bootstrap to a trusted operator; ordinary table writes must not enable escalation.
- Permission regression tests reconstruct the migrations in isolated PostgreSQL (PGlite), using actual database roles rather than mocked predicates; this keeps destructive test fixtures out of the live database.
- Server functions live in `src/lib/*.functions.ts`, never `src/server/**` — the Vite import-protection plugin denies client-graph imports from `src/server/`, which breaks the whole client bundle.
- Self-registration grants only the `customer` role via the `assign_customer_role_on_signup` trigger on `auth.users`; staff roles are added only through the audited admin RPC, and role-aware routing reads roles from the `getMyRoles` server function, never from browser-submitted values.
- Guest customer creation goes only through the `create_guest_customer` RPC (front_desk check, duplicate-review refusal, audit entry); never insert guest profiles directly, so duplicate review and auditing cannot be skipped.
- Career documents live in the private `career-documents` bucket under `<user id>/`; uploads are registered via `register_career_document`, listing/deletion via `list_my_career_documents`/`delete_my_career_document`, and downloads only via a server function that first calls the audited `read_authorised_file` — no user SELECT policy on objects and no signed/public URLs.
- Career profile entries keep draft and confirmed values in separate columns; writes go only through owner-checked RPCs (save_career_draft, request_career_entry_removal, discard_career_draft, confirm_career_profile), so drafts can never silently become confirmed data.
- Opportunities are written only by the scheduled collector (`src/lib/opportunities/`, route `/api/public/jobs/collect-opportunities`, cron-authenticated) via service_role; sources stay disabled until a permission basis, evidence and review date are recorded (DB trigger), so no manual or unauthorised listings can enter.
