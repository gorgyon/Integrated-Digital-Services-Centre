# Integrated Digital Services Centre (IDSC)

Digital services platform for the Mentz Segoreng Village Digital Services
Centre: a physical centre with online reach, five business divisions (graphic
design & printing, career & CV services, job application support, digital
products, and IT support), and a 24/7 AI assistant.

Architecture: **modular monolith** with a shared platform foundation
(identity & roles, orders, secure file vault, service catalogue, payments,
notifications/audit). Business service orders and employment applications are
separate business entities with separate workflows. See `PROJECT_NOTES.md`
for confirmed decisions and the milestone log.

## Repository & ownership

This repository is owned and controlled by the client. It is kept in two-way
sync with the Lovable project, but it is a standard open-source web codebase:
you can clone it, run it, and deploy it independently of Lovable at any time.

## Getting started (independent of Lovable)

Prerequisites: [Bun](https://bun.sh) (v1.1+). Node.js 20+ with npm also works
if you regenerate the lockfile (`npm install`).

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
cp .env.example .env   # fill in local values; never commit real secrets
bun run dev            # http://localhost:8080
```

Other commands:

```sh
bun run test    # automated tests (vitest)
bun run lint    # eslint
bun run build   # production build
```

## Project layout

- `src/routes/` — TanStack Start routes (file-based routing)
- `src/lib/` — shared utilities
- `src/test/` — automated tests
- `supabase/migrations/` — database migration structure (SQL files applied in
  filename order; created when the database milestone begins)
- `public/` — static assets
- `PROJECT_NOTES.md` — confirmed decisions & milestone log
- `.env.example` — configuration template (copy to `.env`; never commit secrets)

## Secrets policy

Never commit API keys, passwords, service-role keys or other secrets. All
configuration arrives via environment variables; `.env*` files are git-ignored.
`.env.example` documents every variable the app expects.

## Built with

- TanStack Start (React 19, TypeScript)
- Tailwind CSS v4 + shadcn/ui
- Vitest
- Lovable Cloud (PostgreSQL, auth, storage) — planned from the database
  milestone onward
