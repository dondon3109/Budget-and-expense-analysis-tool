# Cloudflare deployment runbook

Clarity deploys as two Cloudflare services: a Pages project for the Vite app and a Worker with a D1 binding for the API. Preview and production use separate D1 databases. The repository deliberately contains no account IDs, tokens, or real domain values.

## One-time account setup

1. Authenticate locally with `pnpm --filter @budget/api exec wrangler login`.
2. Create `budget-expense-preview` and `budget-expense-production` with `wrangler d1 create`; retain the two returned database IDs.
3. Copy `apps/api/wrangler.deploy.example.jsonc` to ignored `apps/api/wrangler.deploy.jsonc`. Replace both D1 IDs and the allowed preview/production origins.
4. Create separate preview and production Pages projects. Keep the production custom domain on the production project only.

## Preview release

From `apps/api`, apply migrations and seed the fictional demo data against the preview binding:

```bash
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.deploy.jsonc --env preview
pnpm exec wrangler d1 execute DB --remote --config wrangler.deploy.jsonc --env preview --file=../../db/seed.sql
pnpm exec wrangler deploy --config wrangler.deploy.jsonc --env preview
```

Build the browser app with the deployed preview Worker URL and deploy `apps/web/dist` to the preview Pages project:

```bash
VITE_API_URL=https://PREVIEW_WORKER_URL pnpm --filter @budget/web build
pnpm --dir apps/api exec wrangler pages deploy ../web/dist --project-name=PREVIEW_PAGES_PROJECT --branch=main
```

Run the smoke gate with the exact resulting URLs:

```bash
WEB_URL=https://PREVIEW_PAGES_URL API_URL=https://PREVIEW_WORKER_URL pnpm smoke:production
```

## Production release

Repeat the migration, seed, Worker deploy, frontend build, Pages deploy, and smoke sequence with the production environment. Verify the custom domain’s DNS and certificate are active before adding it as the only production `ALLOWED_ORIGINS` value. Set a canonical URL in the HTML when the final domain is known, and redirect any Pages/Worker aliases to that host.

Before announcing the release, verify direct navigation to `/demo`, `/transactions`, `/import`, and `/budgets`; the committed `_redirects` file provides the SPA fallback. Recapture the desktop/mobile portfolio screenshots from the final custom domain.

## Rollback

- **Pages:** use the Cloudflare deployment history to promote the previously verified frontend deployment.
- **Worker:** roll back to the previous Worker version. Do not roll back code past an incompatible database migration.
- **D1:** migrations are forward-only. Before a destructive schema change, create a D1 Time Travel restore point and rehearse recovery in preview. The current migrations are additive.
- After any rollback, rerun `pnpm smoke:production` against the restored web/API pair.

## Current free-tier release

Released on 2026-07-16 using Cloudflare-provided domains and no paid add-ons:

- Production web: <https://clarity-budget.pages.dev>
- Production API: <https://budget-expense-api-production.dondon3109.workers.dev>
- Preview web: <https://clarity-budget-preview.pages.dev>
- Preview API: <https://budget-expense-api-preview.dondon3109.workers.dev>
- Isolated D1 databases: `budget-expense-production` and `budget-expense-preview`

All four migrations and the fictional seed dataset were applied independently to both databases. Preview passed the smoke gate before production; production then passed landing delivery, API/D1 health, dashboard contract and CORS, filtered CSV export, and non-mutating import preview checks. The final browser pass also verified the production desktop dashboard and a 390 px mobile transactions layout without overflow or console errors.

The Cloudflare `pages.dev` and `workers.dev` hosts provide managed HTTPS. A purchased custom domain is intentionally not required for this free release. If one is attached later, update `ALLOWED_ORIGINS`, the canonical URL, and redirects, then rerun the smoke gate.
