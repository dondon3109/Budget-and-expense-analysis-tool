# Cloudflare and Supabase deployment runbook

Zoption deploys as a Cloudflare Pages app at <https://zoption.site> plus a Worker at <https://api.zoption.site> with a D1 binding. Supabase Auth supplies user identity and sessions; private financial data remains in D1 and is partitioned by the tenant resolved from a verified Supabase JWT. The repository contains the public production domains but deliberately contains no account IDs, private tokens, or service-role keys.

## One-time Supabase setup

1. Create separate Supabase projects for preview and production when practical. If one project is shared initially, keep its redirect allow-list restricted to the known Zoption hosts.
2. In **Authentication > URL configuration**, set the production site URL to `https://zoption.site` and add redirect URLs for:
   - `http://localhost:5173/auth/callback`
   - `https://PREVIEW_WEB_HOST/auth/callback`
   - `https://zoption.site/auth/callback`
   - `https://www.zoption.site/auth/callback`
3. Keep email/password enabled. Configure confirmation email delivery and templates before inviting users.
4. Confirm the project uses an asymmetric JWT signing key exposed through the project JWKS endpoint.
5. Record the project URL and publishable key from **Project Settings > API**. Never use a secret or service-role key in browser configuration.

## One-time Cloudflare setup

1. Authenticate locally with `pnpm --filter @zoption/api exec wrangler login`.
2. Create `budget-expense-preview` and `budget-expense-production` with `wrangler d1 create`; retain the returned database IDs.
3. Copy `apps/api/wrangler.deploy.example.jsonc` to ignored `apps/api/wrangler.deploy.jsonc`.
4. Replace the D1 IDs, allowed origins, and `SUPABASE_URL` values for each environment. Keep `SUPABASE_JWT_AUDIENCE` as `authenticated` unless the Supabase project is intentionally configured otherwise.
5. Create separate preview and production Pages projects. Attach `zoption.site` and `www.zoption.site` to the production Pages project in the Cloudflare dashboard. Pages custom domains are dashboard-managed; this repository does not use an `apps/web/wrangler.jsonc` file.
6. Keep the production Worker custom domain route for `api.zoption.site` in `apps/api/wrangler.deploy.jsonc`; the tracked example documents the same route.

## Frontend configuration

Build Pages with environment-specific public values. The committed `apps/web/.env.production` sets the production API default to `https://api.zoption.site`; Cloudflare Pages environment variables can override it. Local development leaves `VITE_API_URL` blank and uses the Vite proxy at `http://localhost:8787`.

```bash
VITE_API_URL=https://PREVIEW_API_HOST \
VITE_SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PREVIEW_PUBLISHABLE_KEY \
pnpm --filter @zoption/web build
```

The publishable key is intended for browser use. It does not grant access to D1; the Worker still verifies every access token and chooses tenant scope server-side.

## Preview release

Create a D1 Time Travel recovery point before applying migrations that remove retired data, then apply migrations and deploy the Worker:

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.deploy.jsonc --env preview
pnpm exec wrangler deploy --config wrangler.deploy.jsonc --env preview
```

Inspect the preview database after migration: the retired public tenant should be absent, while authenticated user tenants and their records must remain unchanged.

Build and deploy the browser app:

```bash
VITE_API_URL=https://PREVIEW_API_HOST \
VITE_SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PREVIEW_PUBLISHABLE_KEY \
pnpm --filter @zoption/web build
pnpm --dir apps/api exec wrangler pages deploy ../web/dist --project-name=PREVIEW_PAGES_PROJECT --branch=main
```

Run the non-mutating smoke gate:

```bash
WEB_URL=https://PREVIEW_WEB_HOST API_URL=https://PREVIEW_API_HOST pnpm smoke:production
```

Then perform an authenticated browser check with two ordinary preview users:

1. Sign in as user A and create a uniquely named transaction.
2. Sign out and sign in as user B; confirm user A's transaction is absent.
3. Create a user B transaction, then return to user A and confirm only user A's marker is present.
4. Exercise transaction CRUD, import preview/commit, budgets, and CSV export.
5. Sign out and confirm `/app` redirects to login.

No service-role key is needed for normal product traffic or this check.

## Production release

After the preview migration and authenticated checks pass, create a production D1 recovery point, apply migrations, and deploy the Worker. The production Wrangler environment declares `api.zoption.site` as its custom domain and allows `zoption.site`, `www.zoption.site`, and the transitional Pages origin.

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.deploy.jsonc --env production
pnpm exec wrangler deploy --config wrangler.deploy.jsonc --env production
cd ../..
```

Build and deploy the frontend with production Supabase values. `VITE_API_URL` defaults to `https://api.zoption.site` for production builds, but it may be supplied explicitly by the Pages build environment.

```bash
VITE_SUPABASE_URL=https://PRODUCTION_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PRODUCTION_PUBLISHABLE_KEY \
pnpm --filter @zoption/web build
pnpm --dir apps/api exec wrangler pages deploy ../web/dist --project-name=PRODUCTION_PAGES_PROJECT --branch=main
WEB_URL=https://zoption.site API_URL=https://api.zoption.site pnpm smoke:production
```

Verify both production web origins appear in `ALLOWED_ORIGINS` and Supabase's redirect allow-list before inviting users. Direct navigation should work for `/login`, `/signup`, `/forgot-password`, `/auth/callback`, `/update-password`, and `/app/*`; the committed `_redirects` file provides SPA fallback. The retired `/demo` route should return visitors to `/`.

## Rollback

- **Pages:** promote the previously verified frontend deployment.
- **Worker:** roll back to the previous Worker version, but do not roll code back past an incompatible D1 migration.
- **D1:** migrations are forward-only. Create a Time Travel restore point before destructive schema changes and rehearse recovery in preview.
- **Supabase Auth:** do not rotate or remove signing keys as an application rollback mechanism. Follow Supabase key-rotation guidance and keep old keys valid through their transition window.
- After rollback, rerun `pnpm smoke:production` and verify unauthenticated `/api/app/*` requests still return `401`.

## Custom-domain verification

Before treating the domain migration as complete:

1. In the Pages project, confirm `zoption.site` serves the frontend and no Worker route or Worker Custom Domain claims the apex host. If `https://zoption.site/health` returns the API health response, the apex is still routed to the Worker.
2. Deploy the production Worker with `apps/api/wrangler.deploy.jsonc` so its Custom Domain is `api.zoption.site`, then confirm `https://api.zoption.site/health` returns `200`.
3. Add `www.zoption.site` to Pages and configure the canonical redirect, or remove the alias from `ALLOWED_ORIGINS` and Supabase if it will not be served.
4. Run `WEB_URL=https://zoption.site API_URL=https://api.zoption.site pnpm smoke:production` after DNS and custom-domain changes have propagated.

## Current hosted resources

The intended production endpoints are:

- Production web: <https://zoption.site>
- Production web alias: <https://www.zoption.site>
- Production API: <https://api.zoption.site>

Preview endpoints are deployment-specific. Supply them through `PREVIEW_WEB_HOST` and `PREVIEW_API_HOST` in release commands instead of committing provider-generated hostnames.

## Legacy origin cleanup

The legacy production Pages origin is no longer accepted by the API. Production `ALLOWED_ORIGINS` contains only `https://zoption.site` and `https://www.zoption.site`. Keep only the matching custom-domain callback URLs in Supabase, and rerun `WEB_URL=https://zoption.site API_URL=https://api.zoption.site pnpm smoke:production` after deployment or routing changes.
