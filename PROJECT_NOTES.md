# IDSC Project Notes

Project decisions and milestone log for the Integrated Digital Services Centre
(IDSC) — Mentz Segoreng Village. This file is the running record of confirmed
decisions; detailed architecture lives in the approved Phase 0 deliverables.

## Confirmed decisions

| Date (UTC) | Decision | Notes |
|---|---|---|
| 2026-11-01 | Phase 0 v3 architecture & design approved in principle | Modular monolith, shared platform foundation, separate business orders vs employment applications, guest customers, purpose-based file permissions, Paystack + manual cash/EFT, Cash on Collection for centre-collected physical orders only, replaceable providers, milestone-by-milestone implementation. |
| 2026-11-01 | Initial platform language: **English only** | Applies to the interface, notifications, AI assistant and all system-generated communication. Keep the architecture flexible for future languages, but do **not** implement multilingual functionality now. |

## Milestone log

| Milestone | Scope | Status |
|---|---|---|
| M01 | Owner-controlled GitHub repository: source code, manifests, lockfile, config example, migration structure, tests, developer docs; no secrets committed; owner/admin control with the client; independent cloning verified | In progress |
| M02+ | Not started — each milestone requires explicit written approval after the previous one is demonstrated and accepted | — |

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
