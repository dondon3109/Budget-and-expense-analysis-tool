# Cloudflare and Supabase deployment runbook

Zoption deploys as a Cloudflare Pages app at <https://zoption.site> plus a Worker at <https://api.zoption.site> with a D1 binding. Supabase Auth supplies user identity and sessions; private financial data remains in D1 and is partitioned by the tenant resolved from a verified Supabase JWT. The repository contains the public production domains but deliberately contains no account IDs, private tokens, or service-role keys.

## One-time Supabase setup

1. Create separate Supabase projects for preview and production when practical. If one project is shared initially, keep its redirect allow-list restricted to the known Zoption hosts.
2. In **Authentication > URL configuration**, set the production site URL to `https://zoption.site` and add redirect URLs for:
   - `http://localhost:5173/auth/callback`
   - `https://PREVIEW_WEB_HOST/auth/callback`
   - `https://zoption.site/auth/callback`
   - `https://www.zoption.site/auth/callback`
3. Keep email/password enabled. Configure confirmation email delivery and templates before inviting users. The Site URL is only a fallback; password recovery should return through `/auth/callback?next=%2Fupdate-password`. In the recovery email template, link the reset action to `{{ .ConfirmationURL }}` so Supabase preserves the `redirectTo` supplied by the app. Do not link recovery mail directly to `{{ .SiteURL }}`. Compare the reset request's actual `redirectTo` with the dashboard allow-list and add the query-bearing production callback explicitly if Supabase does not accept the base callback entry. New Free-plan projects using Supabase's default SMTP cannot customize Auth templates, so configure custom SMTP when template editing or delivery to non-team addresses is required.
4. In **Authentication > Password security**, set the minimum password length to 12, require lowercase, uppercase, number, and symbol coverage, enable leaked-password protection when available, and require a recent session or reauthentication for password changes. The tracked local Supabase configuration mirrors this policy; the hosted project must enforce it because browser validation can be bypassed by direct Auth API clients. Use an HTTPS project URL in preview and production; the Worker permits cleartext Supabase URLs only for explicit loopback development hosts.
5. Require email confirmation before first sign-in. Keep signup responses neutral for both new and existing addresses so the public form does not disclose whether an account exists.
6. Confirm the project uses an asymmetric JWT signing key exposed through the project JWKS endpoint.
7. Record the project URL and publishable key from **Project Settings > API**. Never use a secret or service-role key in browser configuration.
8. Configure `SUPABASE_PUBLISHABLE_KEY` as a non-secret Worker variable. Store `SUPABASE_SERVICE_ROLE_KEY` only as a Worker secret; the account-deletion workflow uses it to clear the user-owned avatar folder and hard-delete the Auth identity after D1 data is purged:

   ```bash
   pnpm --filter @zoption/api exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.deploy.jsonc --env preview
   pnpm --filter @zoption/api exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.deploy.jsonc --env production
   ```

   Never use this key in `VITE_*` configuration, committed Wrangler `vars`, D1, logs, or browser code.

9. Apply the tracked Supabase migrations to each preview and production project:

   ```bash
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref PROJECT_REF
   pnpm dlx supabase db push --linked
   ```

   The migration creates a public `avatars` bucket limited to 2 MB JPEG, PNG, and WebP files. Public retrieval is intentional for profile pictures; authenticated Storage policies restrict insert and delete operations to the current user's own folder. Relink before pushing when preview and production use separate Supabase projects.

After changing redirect or template settings, request a fresh recovery email; previously issued links retain their original destination and reset links are short-lived and single-use. Open the fresh link once in the same browser profile that requested it so the PKCE verifier is available. If a newly issued link immediately returns `otp_expired`, check whether the email provider's click tracking or security scanner is opening the link before the user.

## One-time Cloudflare setup

1. Authenticate locally with `pnpm --filter @zoption/api exec wrangler login`.
2. Create `budget-expense-preview` and `budget-expense-production` with `wrangler d1 create`; retain the returned database IDs.
3. Copy `apps/api/wrangler.deploy.example.jsonc` to ignored `apps/api/wrangler.deploy.jsonc`.
4. Replace the D1 IDs, allowed origins, and `SUPABASE_URL` values for each environment. Keep `SUPABASE_JWT_AUDIENCE` as `authenticated` unless the Supabase project is intentionally configured otherwise.
5. Create separate preview and production Pages projects. Attach `zoption.site` and `www.zoption.site` to the production Pages project in the Cloudflare dashboard. Pages custom domains are dashboard-managed; this repository does not use an `apps/web/wrangler.jsonc` file.
6. Keep the production Worker custom domain route for `api.zoption.site` in `apps/api/wrangler.deploy.jsonc`; the tracked example documents the same route.
7. Store the DeepSeek key as a Worker secret in each environment; never add it to Wrangler `vars`, D1, browser configuration, or the repository:

   ```bash
   pnpm --filter @zoption/api exec wrangler secret put DEEPSEEK_API_KEY --config wrangler.deploy.jsonc --env preview
   pnpm --filter @zoption/api exec wrangler secret put DEEPSEEK_API_KEY --config wrangler.deploy.jsonc --env production
   ```

8. Keep `DEEPSEEK_MODEL=deepseek-v4-flash`, `ASSISTANT_TIME_ZONE=Asia/Manila`, and assistant timeout/feature settings in non-secret Worker variables. The tracked Wrangler files schedule daily expired-chat cleanup at 03:17 UTC.
9. Before enabling sponsored-seat invitations, onboard a verified sender domain in Cloudflare Email Service, confirm the target account is eligible for Workers Email Sending, and retain the `EMAIL` `send_email` binding in both deployment environments. Set `WEB_APP_URL` to the exact HTTPS Pages origin and `EMAIL_FROM` to the approved sender address; neither value belongs in browser `VITE_*` configuration. Send a controlled invitation to an address you manage before enabling the production platform-admin grant.
10. Configure PayPal subscriptions before enabling paid checkout:
    - Create separate Sandbox and live PayPal API apps. Do not share credentials, webhook IDs, products, or plans between environments.
    - Create one product and two recurring PHP plans in each environment: ₱149 monthly and ₱1,299 annually, with no trial. Confirm the PayPal account can approve those PHP subscription plans before release.
    - Set the non-secret Worker variables for each environment: `PAYPAL_ENVIRONMENT` (`sandbox` for preview, `production` for production), `PAYPAL_PRO_MONTHLY_PLAN_ID`, `PAYPAL_PRO_ANNUAL_PLAN_ID`, and the exact HTTPS `WEB_APP_URL`. Do not put any of these in `VITE_*` configuration.
    - Store `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID` as Worker secrets in each environment. The browser has no PayPal SDK, client ID, iframe, or API connection.

    ```bash
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_CLIENT_ID --config wrangler.deploy.jsonc --env preview
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_CLIENT_SECRET --config wrangler.deploy.jsonc --env preview
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_WEBHOOK_ID --config wrangler.deploy.jsonc --env preview
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_CLIENT_ID --config wrangler.deploy.jsonc --env production
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_CLIENT_SECRET --config wrangler.deploy.jsonc --env production
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_WEBHOOK_ID --config wrangler.deploy.jsonc --env production
    ```

    Register one webhook per environment at `https://PREVIEW_API_HOST/api/billing/paypal/webhook` and `https://api.zoption.site/api/billing/paypal/webhook`. Subscribe only to `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, and `BILLING.SUBSCRIPTION.PAYMENT.FAILED`. Record the matching webhook ID as the environment secret. Never copy OAuth tokens, webhook headers, payer data, or secret values into source code, tracked configuration, or logs.

### PayPal Sandbox Preview setup

The repository setup utility is intentionally locked to PayPal Sandbox and the approved Preview Worker webhook endpoint. It never calls the live PayPal API, patches/deletes existing resources, or changes Cloudflare by itself. It reconciles the `Zoption Pro` product, the ₱149 monthly and ₱1,299 annual PHP plans, and the six-event Preview webhook. A conflicting same-name resource, duplicate webhook, or mismatched webhook event set stops the operation for review.

Use the ignored `apps/api/.dev.vars` file for the Sandbox client ID and secret. Run the default non-mutating preflight first:

```bash
PAYPAL_WEBHOOK_URL=https://budget-expense-api-preview.dondon3109.workers.dev/api/billing/paypal/webhook \
  pnpm paypal:sandbox:setup
```

Review the create/reuse actions, then explicitly apply them:

```bash
PAYPAL_WEBHOOK_URL=https://budget-expense-api-preview.dondon3109.workers.dev/api/billing/paypal/webhook \
  pnpm paypal:sandbox:setup --apply
```

Ordinary output intentionally omits the webhook ID. To transfer it directly to the Preview Worker secret without writing it to a tracked file or shell argument, rerun the idempotent apply in machine-output mode and pipe only the ID to Wrangler:

```bash
PAYPAL_WEBHOOK_URL=https://budget-expense-api-preview.dondon3109.workers.dev/api/billing/paypal/webhook \
  node --env-file=apps/api/.dev.vars scripts/setup-paypal-sandbox.mjs --apply --json \
  | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(input).webhook_id))' \
  | pnpm --filter @zoption/api exec wrangler secret put PAYPAL_WEBHOOK_ID \
      --config wrangler.deploy.jsonc --env preview
```

Copy only the returned non-secret plan IDs into the Preview `vars` block in the ignored `apps/api/wrangler.deploy.jsonc`, set `WEB_APP_URL=https://clarity-budget-preview.pages.dev`, and keep the production block unchanged. Confirm the Preview Worker has all three secret names before deployment:

```bash
pnpm --filter @zoption/api exec wrangler secret list \
  --config wrangler.deploy.jsonc --env preview
```

The expected names are `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID`; `secret list` confirms presence only and does not reveal values.

### Platform-admin recovery operation

The platform administrator is stored only as a Supabase Auth UUID in D1. Do not grant or revoke this role by email, profile metadata, a JWT custom claim, or browser code. Self-service deletion is intentionally blocked while its D1 grant row exists.

To disable complementary platform-admin Pro access and revoke every sponsored seat, run the following only through a trusted D1/server operation after making a recovery point:

```sql
BEGIN;
UPDATE platform_admin_grants
SET complimentary_pro_enabled = 0, disabled_at = datetime('now'), updated_at = datetime('now')
WHERE user_id = '08060c19-8a55-4046-a2e7-7384808dd81c';
UPDATE sponsored_pro_seats
SET state = 'empty', pending_email = NULL, beneficiary_user_id = NULL,
    invited_at = NULL, invite_last_sent_at = NULL, invite_send_lease_until = NULL,
    assigned_at = NULL, updated_at = datetime('now')
WHERE sponsor_user_id = '08060c19-8a55-4046-a2e7-7384808dd81c';
COMMIT;
```

To restore the permanent complementary grant without restoring former beneficiaries, set `complimentary_pro_enabled = 1`, clear `disabled_at`, and leave all five slots empty. Never expose either operation through a browser route.

### Assistant deployment preflight

The real `apps/api/wrangler.deploy.jsonc` is ignored because it contains environment-specific deployment metadata. Before every assistant release, compare its non-secret assistant settings with `apps/api/wrangler.deploy.example.jsonc`; a secret-only change does not synchronize source code, variables, bindings, or cron configuration.

For the target environment:

1. Run a Wrangler deploy dry run using the real config and explicit `--env`.
2. Run `wrangler secret list` and confirm `DEEPSEEK_API_KEY` exists by name. This confirms presence, not the encrypted value, and never prints the key.
3. List remote D1 migrations. Stop if migration inspection is denied; do not infer assistant schema readiness from `/health`, which intentionally checks only D1 availability.
4. Create the documented D1 recovery point before applying a pending migration.
5. Perform a full Worker deploy, not another secret-only deployment.
6. Verify the resulting deployment version, the `03:17 UTC` retention cron, public smoke checks, and an authenticated plain/tool-backed assistant response.

Provider failures emit only a sanitized structured event with `event`, `provider`, `kind`, `reason`, and optional numeric `providerStatus`. Never add prompts, answers, tool arguments/results, account or transaction data, tenant/user/thread/message IDs, JWTs, credentials, headers, exception messages/stacks, or provider response bodies to these logs.

Safe diagnostic actions:

- `configuration/missing_api_key` or `credentials_rejected` — verify the exact Worker environment and re-put the already validated key without printing it.
- `rate_limit/rate_limited` — investigate DeepSeek account quota or throttling; do not rotate credentials blindly.
- `unavailable/upstream_unavailable` — treat provider `5xx` as an upstream outage.
- `unavailable/fetch_failed` — investigate Worker-to-provider connectivity.
- `invalid_response/request_rejected` or `malformed_response` — verify the request/response contract without logging provider bodies.
- No provider event with an API `500` — investigate D1 migration and repository state.

## Frontend configuration

Build Pages with environment-specific public values. The committed `apps/web/.env.production` sets the production-only API fallback to `https://api.zoption.site`. Preview and staging builds must receive `VITE_API_URL` explicitly from the build process; the build rejects the production fallback for those environments. Local development leaves `VITE_API_URL` blank and uses the Vite proxy at `http://localhost:8787`. Set `VITE_GA_MEASUREMENT_ID` to the approved Google Analytics 4 Measurement ID (`G-…`) in each Pages environment. The browser bundle does not load Google Analytics 4 until a visitor enables Analytics in Cookie Settings; do not set the value until the Cookie Policy and provider review are approved. The tracked Pages `_headers` policy restricts scripts, workers, forms, frames, images, and connections to the application, Supabase, Google Analytics, and known API hosts, and enables HSTS on deployed HTTPS responses. The pre-render theme setup loads from same-origin `/theme-bootstrap.js`; do not reintroduce an inline script or weaken `script-src 'self'`. Update and verify CSP whenever a new external asset, API, or authentication host is introduced.

Set `ZOPTION_DEPLOY_ENV` explicitly in every Pages build: `production` for the production project and `preview` or `staging` for non-production projects. Preview/staging builds keep the public content and production canonicals for realistic review, but force HTML and HTTP `noindex,nofollow`, do not publish `sitemap.xml`, and do not advertise a sitemap in `robots.txt`. Production intentionally allows crawlers to fetch private routes rather than disallowing them in `robots.txt`, so crawlers can observe their HTML and `X-Robots-Tag` noindex directives. Vite embeds public environment variables in the generated assets, so changing `VITE_API_URL` or another `VITE_*` value requires a fresh build before deploying; re-uploading an existing `dist` directory does not update it.

```bash
VITE_API_URL=https://PREVIEW_API_HOST \
VITE_SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PREVIEW_PUBLISHABLE_KEY \
VITE_GA_MEASUREMENT_ID=G-APPROVED_MEASUREMENT_ID \
ZOPTION_DEPLOY_ENV=preview \
pnpm --filter @zoption/web build
```

The publishable key is intended for browser use. It does not grant access to D1; the Worker still verifies every access token and chooses tenant scope server-side.

Public canonical URLs do not use trailing slashes. The three legal trailing-slash variants permanently redirect to their canonical path. Public pages accept only standard UTM and ad-click identifiers (`utm_*`, `gclid`, `dclid`, `fbclid`, `msclkid`) as indexable query strings; their canonical remains query-free. Any other query parameter and any authentication/error URL state is noindex. Update a public route's manually maintained sitemap `lastModified` value only when its user-visible content changes materially; the same value feeds legal-page structured-data `dateModified`.

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
VITE_GA_MEASUREMENT_ID=G-APPROVED_MEASUREMENT_ID \
ZOPTION_DEPLOY_ENV=preview \
pnpm --filter @zoption/web build
pnpm --dir apps/api exec wrangler pages deploy ../web/dist --project-name=PREVIEW_PAGES_PROJECT --branch=main
```

Run the non-mutating smoke gate:

```bash
EXPECT_SEARCH_INDEXING=0 WEB_URL=https://PREVIEW_WEB_HOST API_URL=https://PREVIEW_API_HOST pnpm smoke:production
```

Then perform an authenticated browser check with two ordinary preview users:

1. Sign in as user A and create a uniquely named transaction.
2. Sign out and sign in as user B; confirm user A's transaction is absent.
3. Create a user B transaction, then return to user A and confirm only user A's marker is present.
4. Exercise transaction CRUD, transaction search, import preview/commit, budgets, and CSV export.
5. Upload an avatar as user A and confirm it appears in Settings and the sidebar. Confirm user A cannot upload into user B's folder and user B cannot delete user A's object; then confirm each user can replace and remove their own avatar.
6. Confirm unsupported or oversized avatar files are rejected and that the public avatar URL is readable as documented.
7. Sign out and confirm `/app` redirects to login.
8. Give user A and user B distinct transaction ledgers, goals, and debt records, then confirm calculated balances, planning records, and assistant answers remain scoped to the signed-in user.
9. Confirm the assistant requires current versioned DeepSeek consent, refuses mutation/credential/SQL requests, treats instructions inside stored text as data, shows source/data-quality details, applies regulated-topic redirects, and deletes one/all chats with their audit snapshots.
10. Inspect Worker logs and confirm they contain no prompts, responses, tool payloads, account names, transaction descriptions, JWTs, or API keys. Inspect active D1 assistant audits separately and confirm snapshots exclude notes, secrets, tenant/user IDs, and provider payloads.

The normal application path needs no browser access to a service-role key. Account deletion is the narrow Worker-only exception: it writes an irreversible D1 tombstone before purging the tenant, then clears avatar Storage and hard-deletes the Auth identity. The tombstone blocks a retained access token from creating a replacement tenant; the daily Worker cron retries pending external cleanup. Display names and avatar metadata are presentation-only and must not change Worker tenant resolution or D1 authorization.

Before publishing the legal routes, business and legal reviewers must resolve every `[TODO: fill in]`, the subscription placeholder, governing-law terms, contact workflow, lawful bases, processor facts, international-transfer details, retention periods, and security statements. Do not publish unresolved placeholders as final legal advice.

## Production release

After the preview migration and authenticated checks pass, create a production D1 recovery point, apply migrations, and deploy the Worker. The production Wrangler environment declares `api.zoption.site` as its custom domain and allows `zoption.site`, `www.zoption.site`, and the transitional Pages origin.

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.deploy.jsonc --env production
pnpm exec wrangler deploy --config wrangler.deploy.jsonc --env production
cd ../..
```

Build and deploy the frontend with production Supabase values. `VITE_API_URL` defaults to `https://api.zoption.site` for production builds, but it may be supplied explicitly by the Pages build environment. Set `ZOPTION_DEPLOY_ENV=production` in the production Pages project. The web build rejects Cloudflare Pages builds without this explicit environment value so a preview project cannot accidentally publish indexable pages.

```bash
VITE_SUPABASE_URL=https://PRODUCTION_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PRODUCTION_PUBLISHABLE_KEY \
VITE_GA_MEASUREMENT_ID=G-APPROVED_MEASUREMENT_ID \
ZOPTION_DEPLOY_ENV=production \
pnpm --filter @zoption/web build
pnpm --dir apps/api exec wrangler pages deploy ../web/dist --project-name=PRODUCTION_PAGES_PROJECT --branch=main
WEB_URL=https://zoption.site API_URL=https://api.zoption.site pnpm smoke:production
```

Verify both production web origins appear in `ALLOWED_ORIGINS` and Supabase's redirect allow-list before inviting users. The deployed output pre-renders `/`, `/terms-of-service`, `/privacy-policy`, and `/cookie-policy`; it also publishes `/sitemap.xml`, `/robots.txt`, `/llms.txt`, and a branded `404.html`. The committed `_redirects` file routes only authentication and private application paths to the `spa.html` shell, sends legacy application paths through permanent redirects, and leaves unknown public paths as HTTP 404 responses. Confirm the consent banner makes no Analytics or Marketing requests before opt-in, Google Analytics 4 loads only after Analytics opt-in, and withdrawal removes the in-page Google Analytics integration. The retired `/demo` route should return HTTP 404.

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

## Search visibility verification

After the apex redirect, public metadata, and production smoke checks pass:

1. Verify `https://zoption.site` as the canonical Google Search Console property and verify the same canonical host in Bing Webmaster Tools.
2. Submit `https://zoption.site/sitemap.xml` to both services.
3. Run the [Schema.org Markup Validator](https://validator.schema.org/) for `/` and each legal page. Confirm every public response has one linked graph using `https://zoption.site` canonical IDs: `WebApplication` on the homepage and `WebPage` on legal pages.
4. Run Google's [Rich Results Test](https://search.google.com/test/rich-results) as a diagnostic, but do not fabricate offers, pricing, reviews, or ratings to seek eligibility. Zoption intentionally publishes no organization/person, breadcrumb, FAQ, local-business, search-action, or bank-affiliation markup until corresponding visible, verified content exists.
5. Inspect the rendered HTML and Search Console URL Inspection result for `/` and each legal page. Confirm the canonical points to `https://zoption.site`, Open Graph tags reference the social image, the structured-data graph is present, and the page is indexable.
6. Confirm `/login`, `/auth/callback`, and `/app/*` return `X-Robots-Tag: noindex, nofollow`, do not emit managed JSON-LD, and do not enter the sitemap.
7. Recheck the Coverage, Core Web Vitals, and Performance reports after new or materially updated public content is released.

## Current hosted resources

The intended production endpoints are:

- Production web: <https://zoption.site>
- Production web alias: <https://www.zoption.site>
- Production API: <https://api.zoption.site>

Preview endpoints are deployment-specific. Supply them through `PREVIEW_WEB_HOST` and `PREVIEW_API_HOST` in release commands instead of committing provider-generated hostnames.

## Legacy origin cleanup

The legacy production Pages origin is no longer accepted by the API. Production `ALLOWED_ORIGINS` contains only `https://zoption.site` and `https://www.zoption.site`. Keep only the matching custom-domain callback URLs in Supabase, and rerun `WEB_URL=https://zoption.site API_URL=https://api.zoption.site pnpm smoke:production` after deployment or routing changes.
