# IDSC Project Notes

Project decisions and milestone log for the Integrated Digital Services Centre
(IDSC) — Mentz Segoreng Village. This file is the running record of confirmed
decisions; detailed architecture lives in the approved Phase 0 deliverables.

## Confirmed decisions

| Date (UTC) | Decision | Notes |
|---|---|---|
| 2026-11-01 | Phase 0 v3 architecture & design approved in principle | Modular monolith, shared platform foundation, separate business orders vs employment applications, guest customers, purpose-based file permissions, Paystack + manual cash/EFT, Cash on Collection for centre-collected physical orders only, replaceable providers, milestone-by-milestone implementation. |
| 2026-11-01 | Initial platform language: **English only** | Applies to the interface, notifications, AI assistant and all system-generated communication. Keep the architecture flexible for future languages, but do **not** implement multilingual functionality now. |
| 2026-11-01 | M01 accepted; M02 only authorised | Lillian confirmed repository ownership under `gorgyon`, direct file access and working sync. M02 is limited to skeleton, safe deployment configuration and backup plan; no M03 or business functionality. |
| 2026-11-01 | Backup storage deferred; Lovable Cloud confirmed as platform | Separate off-site backup storage (R2/Backblaze etc.) deferred until before production launch. Use Lovable Cloud for hosting, database and file storage; retain built-in backups at no extra cost; no additional paid backup services or credit purchases without approval. |
| 2026-11-01 | M02 accepted; M03 authorised | M03 limited to shared database schema slices only: migrations, constraints, indexes, RLS preparation and tests. No business functionality, no M04. |
| 2026-11-01 | M03 accepted; M04 authorised only | Lillian confirmed the M03 SQL in GitHub. M04 covers RLS, role boundaries, purpose-specific file consent and audit, plus bypass tests. No login screens, payments or M05. |
| 2026-11-01 | M04 accepted; M05 authorised only | M05 covers customer/staff sign-in only: email+password via Lovable Cloud auth, no social providers, no dashboards or business modules, no paid services. Stop before M06. |

## Milestone log

| Milestone | Scope | Status |
|---|---|---|
| M01 | Owner-controlled GitHub repository: source code, manifests, lockfile, config example, migration structure, tests, developer docs; no secrets committed; owner/admin control with the client; independent cloning verified | Complete — repository connected and synced; independent clone verified by the client |
| M02 | Non-operational English preparation screen; environment guard; explicit deployment target; GitHub production verification workflow; backup/restore plan | Implemented locally, awaiting remote sync/production Actions verification and backup-policy decisions; not fully signed off |
| M03 | Shared database schema slices: `user_roles` + `has_role`, `customer_profiles` (guest + registered), `files` vault metadata, `orders` and `employment_applications` as separate entities; RLS enabled with policies on all tables; constraints, indexes; 8 schema tests | Implemented and verified in the live database; awaiting Lillian's review and sign-off. Migration file: `drizzle/migrations/0000_m03_shared_schema.sql` (this project uses Drizzle migrations, not `supabase/migrations/`; the misleading placeholder README there was removed on 2026-11-01) |
| M04 | Review and harden existing RLS; scoped staff access, customer-approved file permissions, audit and actual PostgreSQL bypass tests | Complete — approved 2026-11-01 after 69/69 hosted checks and a clean deep security scan. See `docs/M04_SECURITY.md`. |
| M05 | Customer and staff sign-in: email+password registration/sign-in, separate staff sign-in, secure sign-out, session handling, role-aware routing from trusted database roles, signup trigger granting only the customer role | Implemented and verified in a real browser (8/8 essential checks); 64/64 automated tests; build OK. Migration: `drizzle/migrations/0004_m05_customer_signup_role.sql`. Awaiting Lillian's GitHub sync confirmation and review. Actual-file download checks remain deferred until a storage milestone. |
| M06+ | Not started — explicit written approval required after M05 review | Blocked |

### M02 checks and review blockers

- Seven automated tests passed (routing, configuration safety, English-only and no-business-feature boundaries). Environment check passed.
- Browser verified HTTP 200, refresh, desktop/mobile fit and no runtime errors. Automatic project checks report `build OK`, but no production output exists locally; this is not proof of a production bundle.
- GitHub Actions is configured to run the real production build. Lillian must confirm the new files synchronised and the verification job succeeds; the agent cannot inspect Git sync status or claim remote verification.
- Proposed backup policy: nightly paired database/original-file backups, 7 daily/4 weekly/12 monthly retention, encrypted client-controlled off-site location, failure/staleness alerts and quarterly restore drills. No operational backup or real restore exists before data/storage approval.
- Owner decisions: destination/region/budget, policy/recovery targets, alert recipient, restore operator and recovery-key custody. See concise `docs/BACKUP_RESTORE.md` and `docs/DEPLOYMENT.md`.
- No services, live credentials, database schema, business features or publishing activated. Stop before M03.

## Standing rules (from approved Phase 0)

- No implementation milestone starts without Lillian's explicit written approval.
- Business service orders and employment applications are separate business
  entities with separate workflows; they share customer accounts, file storage,
  notifications and platform services but must never be conflated.
- No PC rental / internet café services; standalone logos only (no general
  branding packages); truthful, localised AI with no fabricated outcomes.
- Never commit API keys, passwords, service-role keys or other secrets to the
  repository. Use environment variables; see `.env.example`.
- No unnecessary paid services or integrations.
