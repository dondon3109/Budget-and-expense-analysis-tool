# Cloudflare and Supabase deployment runbook

Clarity deploys as a Cloudflare Pages app plus a Worker with a D1 binding. Supabase Auth supplies user identity and sessions; private financial data remains in D1 and is partitioned by the tenant resolved from a verified Supabase JWT. The repository deliberately contains no account IDs, private tokens, service-role keys, or real domain values.

## One-time Supabase setup

1. Create separate Supabase projects for preview and production when practical. If one project is shared initially, keep its redirect allow-list restricted to the known Clarity hosts.
2. In **Authentication > URL configuration**, set the correct site URL and add redirect URLs for:
   - `http://localhost:5173/auth/callback`
   - `https://PREVIEW_PAGES_HOST/auth/callback`
   - `https://PRODUCTION_HOST/auth/callback`
3. Keep email/password enabled. Configure confirmation email delivery and templates before inviting users.
4. Confirm the project uses an asymmetric JWT signing key exposed through the project JWKS endpoint.
5. Record the project URL and publishable key from **Project Settings > API**. Never use a secret or service-role key in browser configuration.

## One-time Cloudflare setup

1. Authenticate locally with `pnpm --filter @budget/api exec wrangler login`.
2. Create `budget-expense-preview` and `budget-expense-production` with `wrangler d1 create`; retain the returned database IDs.
3. Copy `apps/api/wrangler.deploy.example.jsonc` to ignored `apps/api/wrangler.deploy.jsonc`.
4. Replace the D1 IDs, allowed origins, and `SUPABASE_URL` values for each environment. Keep `SUPABASE_JWT_AUDIENCE` as `authenticated` unless the Supabase project is intentionally configured otherwise.
5. Create separate preview and production Pages projects. Keep a production custom domain on the production project only.

## Frontend configuration

Build Pages with environment-specific public values:

```bash
VITE_API_URL=https://PREVIEW_WORKER_URL \
VITE_SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PREVIEW_PUBLISHABLE_KEY \
pnpm --filter @budget/web build
```

The publishable key is intended for browser use. It does not grant access to D1; the Worker still verifies every access token and chooses tenant scope server-side.

## Preview release

Apply migrations and seed only the fictional public demo:

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.deploy.jsonc --env preview
pnpm exec wrangler d1 execute DB --remote --config wrangler.deploy.jsonc --env preview --file=../../db/seed.sql
pnpm exec wrangler deploy --config wrangler.deploy.jsonc --env preview
```

Build and deploy the browser app:

```bash
VITE_API_URL=https://PREVIEW_WORKER_URL \
VITE_SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PREVIEW_PUBLISHABLE_KEY \
pnpm --filter @budget/web build
pnpm --dir apps/api exec wrangler pages deploy ../web/dist --project-name=PREVIEW_PAGES_PROJECT --branch=main
```

Run the non-mutating smoke gate:

```bash
WEB_URL=https://PREVIEW_PAGES_URL API_URL=https://PREVIEW_WORKER_URL pnpm smoke:production
```

Then perform an authenticated browser check with two ordinary preview users:

1. Sign in as user A and create a uniquely named transaction.
2. Sign out and sign in as user B; confirm user A's transaction is absent.
3. Create a user B transaction, then return to user A and confirm only user A's marker is present.
4. Exercise transaction CRUD, import preview/commit, budgets, and CSV export.
5. Sign out and confirm `/app` redirects to login.

No service-role key is needed for normal product traffic or this check.

## Production release

Repeat the migration, seed, Worker deploy, frontend build, Pages deploy, smoke check, and two-user isolation check with production configuration. Verify the production origin appears in both `ALLOWED_ORIGINS` and Supabase's redirect allow-list before inviting users.

Direct navigation should work for `/demo`, `/login`, `/signup`, `/forgot-password`, `/auth/callback`, `/update-password`, and `/app/*`; the committed `_redirects` file provides SPA fallback.

## Rollback

- **Pages:** promote the previously verified frontend deployment.
- **Worker:** roll back to the previous Worker version, but do not roll code back past an incompatible D1 migration.
- **D1:** migrations are forward-only. Create a Time Travel restore point before destructive schema changes and rehearse recovery in preview.
- **Supabase Auth:** do not rotate or remove signing keys as an application rollback mechanism. Follow Supabase key-rotation guidance and keep old keys valid through their transition window.
- After rollback, rerun `pnpm smoke:production` and verify unauthenticated `/api/app/*` requests still return `401`.

## Current hosted resources

The existing Cloudflare hosts are:

- Production web: <https://clarity-budget.pages.dev>
- Production API: <https://budget-expense-api-production.dondon3109.workers.dev>
- Preview web: <https://clarity-budget-preview.pages.dev>
- Preview API: <https://budget-expense-api-preview.dondon3109.workers.dev>

These deployments must be rebuilt with the new Supabase variables and the `user_tenants` D1 migration before authenticated accounts are available. Deployment is not performed automatically by the implementation work.
