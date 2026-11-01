# M02 deployment and environment

No database, file storage, login, payment provider or other external service is required for this skeleton. Nothing is published automatically. GitHub verification builds do not deploy.

## Independent verification

From the owner-controlled repository, with Bun installed:

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run check:env
bun run test
bun run dev
# Separate terminal, when ready to verify production:
bun run build
```

The GitHub Actions **Verify IDSC skeleton** workflow repeats environment checks, tests and the actual production build on pushes and pull requests. A green job and its `idsc-production-skeleton` artifact demonstrate a production build; a running development preview or typecheck alone does not. Check Actions in GitHub after sync. Account allowances/billing are controlled by the owner; disable the workflow if free CI allowances are exhausted. No paid service has been activated here.

## Deployment target

`vite.config.ts` explicitly targets Nitro's `cloudflare-module` preset, using the existing TanStack bootstrap and SSR entry. Production output is `.output/`; deploy the **whole** generated output, not just static assets. The generated server folder includes `wrangler.json`. On an independently managed Cloudflare account, after reviewing the generated configuration and confirming the plan/cost, use a locally installed Wrangler CLI:

```sh
wrangler deploy --config .output/server/wrangler.json
```

Do not deploy without Lillian's approval. This is a documented target, not a tested independent deployment. The generated configuration/output and production runtime still need validation in the target account. Other hosts require a suitable Nitro preset and their own deployment verification; the source is portable but build artifacts are target-specific. Never use Node-only modules in application server code for this target.

## Environment inventory

| Variables | M02 requirement | Later use |
|---|---|---|
| `VITE_APP_URL` | Optional; absolute public URL | Links generated after publication |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Not configured, not required | Future Cloud public client configuration |
| `SUPABASE_SECRET_KEY` | Not configured; server-only | Approved privileged server operations only |
| `VITE_PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY` | Not configured, not required | Later approved Paystack integration |

All `VITE_` variables are browser-public. `.env.example` has safe commented examples only. Real `.env*`, `.dev.vars` and build output are ignored. Supply private values in the host's secret manager, never GitHub files or build logs. Paystack webhooks use the Paystack secret key for signature verification, not an invented separate webhook secret. Backup credentials will belong to a separate approved runner, never `VITE_` variables or the app repository.

## GitHub review gate

Lillian confirmed M01 repository ownership under `gorgyon`, direct source access and working sync. Verify this M02 update appears on the connected branch, then inspect the Actions result. Lovable's agent cannot read Git sync status; do not treat local changes as proof of remote sync. Preserve owner/admin access. Stop before M03.