# Cloudflare and Supabase deployment runbook

Zoption deploys as two Cloudflare Pages projects and a Worker: the public site (`apps/site`, Pages project `zoption-site`) at <https://zoption.site>, the signed-in web app (`apps/web`, Pages project `clarity-budget`) at <https://app.zoption.site>, and the API Worker at <https://api.zoption.site> with a D1 binding. Supabase Auth supplies user identity and sessions; private financial data remains in D1 and is partitioned by the tenant resolved from a verified Supabase JWT. The repository contains the public production domains but deliberately contains no account IDs, private tokens, or service-role keys.

## One-time Supabase setup

1. Create separate Supabase projects for Preview and Production. Deployment validation fails closed when environments reuse a normalized Supabase origin or publishable key, preventing Preview authentication traffic from reaching Production and vice versa.
2. In each project's **Authentication > URL configuration**, keep environments isolated:
   - Preview: set the site URL to `https://PREVIEW_WEB_HOST` and allow only `http://localhost:5173/auth/callback` (when this project is used locally) plus `https://PREVIEW_WEB_HOST/auth/callback`.
   - Production: set the site URL to `https://app.zoption.site` and allow `https://app.zoption.site/auth/callback`. Sign-in lives only on the app origin; the public site permanently redirects `/auth/*` there with the query string intact, so a link issued for the old `https://zoption.site/auth/callback` still completes.
3. Keep email/password enabled. Configure confirmation email delivery and templates before inviting users. The Site URL is only a fallback; password recovery should return through `/auth/callback?next=%2Fupdate-password`. In the recovery email template, link the reset action to `{{ .ConfirmationURL }}` so Supabase preserves the `redirectTo` supplied by the app. Do not link recovery mail directly to `{{ .SiteURL }}`. Compare the reset request's actual `redirectTo` with the dashboard allow-list and add the query-bearing production callback explicitly if Supabase does not accept the base callback entry. New Free-plan projects using Supabase's default SMTP cannot customize Auth templates, so configure custom SMTP when template editing or delivery to non-team addresses is required.

   Both hosted projects run custom SMTP through Resend, configured identically. These are the live values, read back from the project rather than assumed:

   - Host `smtp.resend.com`, port `465`, user `resend`, password set to a Resend API key that has sending access for `zoption.site`.
   - Sender address `auth@zoption.site` with sender name `Zoption`.
   - Recovery, confirmation, email change, invite, and magic link templates link to `{{ .ConfirmationURL }}`. Reauthentication uses the raw `{{ .Token }}`, which is correct for a code rather than a link.
   - The redirect allow list carries `https://app.zoption.site/auth/callback`, the Preview Pages callback, the local callback, and the `zoption://`, `zoption-dev://`, and `zoption-preview://` mobile schemes.
   - `mailer_autoconfirm` is false, so every signup depends on this delivery path working.
   - `rate_limit_email_sent` is 30 per hour. Raise it before a launch that could send more than 30 confirmation or recovery messages in an hour.
   - The SMTP password is its own Resend key, named `Supabase Auth SMTP`, deliberately separate from the Worker's `Send SMTP` key in step 12 so rotating one cannot break the other. Rotate it in the Resend dashboard, then set it here and verify delivery. A stale password fails every confirmation and recovery email silently, because the app surfaces no error for a message Supabase never delivered.
   - On the free plan a project with no traffic pauses itself after about a week. A paused project serves no Auth at all and rejects configuration changes with `Project is paused`, so restore it first and expect to restore it again after any quiet period.

   Read the live values back instead of trusting this list:

   ```bash
   curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     https://api.supabase.com/v1/projects/PROJECT_REF/config/auth
   ```

   The API reports `smtp_pass` as an opaque 64 character value, so the stored password can never be verified by reading it, only by sending through it. To write the config back, send `smtp_port` as a string; a number is rejected with HTTP 400.

   Verify delivery after any credential change instead of assuming it worked. Request a recovery message for an address you control, then read the auth log for that request:

   ```bash
   curl -s -X POST "https://PROJECT_REF.supabase.co/auth/v1/recover" \
     -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
     -d '{"email":"an-address-you-control"}'

   curl -s -G "https://api.supabase.com/v1/projects/PROJECT_REF/analytics/endpoints/logs.all" \
     --data-urlencode "sql=select timestamp, event_message from auth_logs order by timestamp desc limit 5" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
   ```

   A password Resend will not accept fails the request with HTTP 500 and `"error_code":"unexpected_failure"`, and the log line carries the reason, for example `535 "Authentication credentials invalid"`. The same SMTP host, port, and user with a valid key succeed, so that error always means the stored password is stale or mistyped rather than the endpoint being wrong.

4. In **Authentication > Password security**, set the minimum password length to 12, require lowercase, uppercase, number, and symbol coverage, enable leaked-password protection when available, and require a recent session or reauthentication for password changes. The tracked local Supabase configuration mirrors this policy; the hosted project must enforce it because browser validation can be bypassed by direct Auth API clients. Use an HTTPS project URL in preview and production; the Worker permits cleartext Supabase URLs only for explicit loopback development hosts.
5. Require email confirmation before first sign-in. Keep signup responses neutral for both new and existing addresses so the public form does not disclose whether an account exists.
6. Confirm the project uses an asymmetric JWT signing key exposed through the project JWKS endpoint.
7. Record the project URL and `sb_publishable_…` key from **Project Settings > API**. A legacy JWT `anon` key remains supported during Supabase's migration window, but a secret, `sb_secret_…`, or legacy `service_role` key is never valid browser configuration.
8. Configure `SUPABASE_PUBLISHABLE_KEY` as a non-secret Worker variable. It must match the project represented by `SUPABASE_URL`. Store `SUPABASE_SERVICE_ROLE_KEY` only as a Worker secret; the account-deletion workflow uses it to hard-delete the Auth identity and to clear any leftover Supabase Storage avatar objects after D1 data and R2 pictures are purged:

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

   The migration creates a private `avatars` bucket (`public = false` plus an owner SELECT policy). It is kept only as a read fallback for pictures uploaded before the R2 cutover: the Worker reads those objects through the authenticated Storage endpoint with `SUPABASE_SERVICE_ROLE_KEY`, and `/api/public/avatars/*` stays the only public surface. New uploads go to Cloudflare R2 through the Worker. Relink before pushing when preview and production use separate Supabase projects.

   **Deploy ordering**: deploy the Worker before `supabase db push --linked`. The previous Worker served pre-R2 avatars through the bucket's public object URL, so making the bucket private first leaves those avatars 404ing until the new Worker is live. The reverse order is safe, because the new Worker already reads through the authenticated endpoint.

After changing redirect or template settings, request a fresh recovery email; previously issued links retain their original destination and reset links are short-lived and single-use. Open the fresh link once in the same browser profile that requested it so the PKCE verifier is available. If a newly issued link immediately returns `otp_expired`, check whether the email provider's click tracking or security scanner is opening the link before the user.

### Social login providers

Google is the only social provider currently offered. Facebook must remain disabled in Supabase until its application code and Meta publishing requirements are ready for public use. Never put provider secrets in the repository, a `VITE_*` variable, Cloudflare Pages, D1, logs, or chat.

1. In the Google Cloud console, create a Web OAuth client. Register the Supabase callback shown under **Authentication > Sign In / Providers > Google**, with the form `https://PROJECT_REF.supabase.co/auth/v1/callback`. Enter the client ID and secret only in that Supabase provider panel and enable Google.
2. To reintroduce Facebook later, restore its typed application flow and tests, finish the Meta app's publishing requirements, register the Supabase callback shown under **Authentication > Sign In / Providers > Facebook** as a Valid OAuth Redirect URI, and require both `public_profile` and `email`. Enter the app ID and secret only in the Supabase provider panel. Do not enable the provider until the complete flow is ready to release.
3. Keep the Zoption callback URLs from step 2 of the one-time setup in Supabase's redirect allow-list. The provider redirects to Supabase first; Supabase then returns the browser to Zoption's `/auth/callback` route for the PKCE code exchange.
4. Keep Supabase automatic identity linking enabled. When an OAuth provider returns the same verified email as an existing email/password or OAuth account, Supabase links the new identity to that Auth user. Zoption therefore retains the same subject, tenant mapping, and financial workspace instead of creating a duplicate. Do not add a public email-existence lookup or client-side merge flow.
5. Complete Meta App Review and move the app out of Development mode before restoring Facebook in production. Until then, Facebook login works only for app roles and testers.

Before release, test Google in Preview with a fresh address and with the verified email of an existing password account. In **Authentication > Users**, the existing-account case must show one user with the added provider identity and the same user ID. Sign in both ways and confirm the same D1 workspace appears. Verify a cancelled or failed provider flow returns to a neutral retry screen, and confirm a provider-only user can create a password in Account Settings before permanent deletion. Repeat the complete provider and same-email test suite before Facebook is ever restored.

## One-time Cloudflare setup

1. Authenticate locally with `pnpm --filter @zoption/api exec wrangler login`.
2. Create `budget-expense-preview` and `budget-expense-production` with `wrangler d1 create`; retain the returned database IDs.
3. Create separate preview and production R2 buckets and Queues. The tracked names are `zoption-avatars-preview`, `zoption-avatars-production`, `budget-expense-jobs-preview`, and `budget-expense-jobs-production`:

   ```bash
   pnpm --filter @zoption/api exec wrangler r2 bucket create zoption-avatars-preview
   pnpm --filter @zoption/api exec wrangler r2 bucket create zoption-avatars-production
   pnpm --filter @zoption/api exec wrangler queues create budget-expense-jobs-preview
   pnpm --filter @zoption/api exec wrangler queues create budget-expense-jobs-production
   ```

   Durable Object rate-limit storage is created by the Worker migration on deploy; do not create it by hand.

4. Copy `apps/api/wrangler.deploy.example.jsonc` to the tracked `apps/api/wrangler.deploy.jsonc`. That file is committed on purpose and may hold only publishable values — Supabase publishable or anon keys, D1 ids, R2 bucket names, queue names, PayPal plan ids, Dodo product ids and non-secret flags. Every credential goes through `wrangler secret put`, never into this file.
5. Replace each environment's D1 ID, allowed origins, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`. Keep `SUPABASE_JWT_AUDIENCE` as `authenticated` unless the Supabase project is intentionally configured otherwise. The publishable key is public configuration, but secret and service-role key types remain forbidden in Wrangler `vars`.
6. Validate the real config before any migration or deploy. The validator reports only environment and binding names; it never prints configured values:

   ```bash
   node scripts/validate-deployment-config.mjs
   ```

   It checks Preview and Production D1 bindings, RATE_LIMIT Durable Object, AVATARS R2, and JOBS queue bindings, exact HTTPS web/Supabase origins, production routing, publishable-key type, distinct Supabase origins, keys, R2 buckets, and queues across environments, PayPal namespace and distinct monthly/annual plan variables, optional Dodo Payments mode and product variables, optional PostHog enable/environment values and the exact approved US Cloud origin, placeholders, and forbidden secret values in `vars`. Production PayPal must use `production`; Preview and Staging may intentionally use either `sandbox` or `production`. It also validates Staging when an `env.staging` block exists.

7. Create separate preview and production Pages projects for each surface. Production: `zoption-site` (public site) carries the custom domains `zoption.site` and `www.zoption.site`; `clarity-budget` (web app) carries `app.zoption.site`. Custom domains are dashboard-managed. `apps/site/wrangler.jsonc` is the source of truth for the site project's build output and runtime (it has no bindings or secrets); the app project has no Wrangler file.
8. Keep the production Worker custom domain route for `api.zoption.site` in `apps/api/wrangler.deploy.jsonc`; the tracked example documents the same route.
9. Store the DeepSeek key as a Worker secret in each environment; never add it to Wrangler `vars`, D1, browser configuration, or the repository:

   ```bash
   pnpm --filter @zoption/api exec wrangler secret put DEEPSEEK_API_KEY --config wrangler.deploy.jsonc --env preview
   pnpm --filter @zoption/api exec wrangler secret put DEEPSEEK_API_KEY --config wrangler.deploy.jsonc --env production
   ```

10. Keep `DEEPSEEK_MODEL=deepseek-flash` (the fallback when no active D1 configuration can be read), `ASSISTANT_TIME_ZONE=Asia/Manila`, and assistant timeout/feature settings in non-secret Worker variables. The tracked Wrangler files schedule daily expired-chat cleanup at 03:17 UTC.
11. Create a dedicated PostHog US Cloud project for AI Observability, verify and disclose its actual event-retention plan, and leave `POSTHOG_AI_OBSERVABILITY_ENABLED=false` until Preview payloads are verified and the matching assistant consent version is deployed. The current project uses PostHog's 12-month event-retention plan; Session Replay's separate 30-day setting does not apply to `$ai_generation` events. Keep `POSTHOG_HOST=https://us.i.posthog.com` and the exact `POSTHOG_AI_ENVIRONMENT` (`preview` or `production`) in Worker `vars`. Store the project token only as a Worker secret:

    ```bash
    pnpm --filter @zoption/api exec wrangler secret put POSTHOG_PROJECT_TOKEN --config wrangler.deploy.jsonc --env preview
    pnpm --filter @zoption/api exec wrangler secret put POSTHOG_PROJECT_TOKEN --config wrangler.deploy.jsonc --env production
    ```

    PostHog is server-side and metadata-only. Do not add a browser SDK, `VITE_POSTHOG_*`, PostHog web cookies, identify/group events, or Pages CSP origins. The Worker uses random trace IDs, disables person-profile processing and GeoIP enrichment, replaces the capture source address with the non-routable `0.0.0.0` placeholder, and excludes questions, answers, financial records, tool payloads, credentials, and internal IDs.

12. Before enabling sponsored-seat invitations, bug-report notifications, or Pro trial emails, onboard the sender domain in Resend and store the `RESEND_API_KEY` as a Worker secret in each deployment environment. Set `WEB_APP_URL` to the exact HTTPS app origin (`https://app.zoption.site` in Production, which the validator enforces), `EMAIL_FROM` to the verified sender address, and `BUG_REPORT_TO` to the private support inbox; none belongs in browser `VITE_*` configuration. This works on the Cloudflare Free plan because delivery goes through the Resend REST API (no `send_email` binding). Send a controlled invitation and bug report to addresses you manage before enabling production use. Pro trial emails (started, ending tomorrow, ended) go out from the five-minute cron and look up the recipient in Supabase Auth with `SUPABASE_SERVICE_ROLE_KEY`; a send that fails five times is dropped.

    ```bash
    pnpm --filter @zoption/api exec wrangler secret put RESEND_API_KEY --config wrangler.deploy.jsonc --env preview
    pnpm --filter @zoption/api exec wrangler secret put RESEND_API_KEY --config wrangler.deploy.jsonc --env production
    ```

    This key belongs to the Worker alone. Supabase Auth holds its own Resend key as the SMTP password in step 3, so the two rotate independently and a rotation on one side never breaks the other.

13. Configure PayPal subscriptions before enabling paid checkout:
    - Choose the PayPal namespace independently for each non-production environment: `sandbox` or `production`. Preview currently intentionally uses PayPal Live, so its `PAYPAL_ENVIRONMENT` is `production`; do not change it to Sandbox merely because the Worker environment is named Preview. Production must always use `production`.
    - Create a separate PayPal API app and separate product, plans, and webhook for every deployment environment in its selected namespace. Do not share credentials, webhook IDs, products, or plans between Preview and Production, even when both use PayPal Live.
    - Create two recurring PHP plans per environment: ₱149 monthly and ₱1,299 annually, with no trial. Confirm the PayPal account can approve those PHP subscription plans before release.
    - Set `PAYPAL_ENVIRONMENT`, `PAYPAL_PRO_MONTHLY_PLAN_ID`, and `PAYPAL_PRO_ANNUAL_PLAN_ID` as non-secret Worker variables. Monthly and annual plan IDs must be non-placeholder and distinct. Set the exact HTTPS `WEB_APP_URL` as well. Do not put any of these in `VITE_*` configuration.
    - Store `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID` as Worker secrets in the same Sandbox or Live namespace selected by `PAYPAL_ENVIRONMENT`. The browser has no PayPal SDK, client ID, iframe, or API connection.

    ```bash
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_CLIENT_ID --config wrangler.deploy.jsonc --env preview
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_CLIENT_SECRET --config wrangler.deploy.jsonc --env preview
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_WEBHOOK_ID --config wrangler.deploy.jsonc --env preview
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_CLIENT_ID --config wrangler.deploy.jsonc --env production
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_CLIENT_SECRET --config wrangler.deploy.jsonc --env production
    pnpm --filter @zoption/api exec wrangler secret put PAYPAL_WEBHOOK_ID --config wrangler.deploy.jsonc --env production
    ```

    Register one webhook per environment at `https://PREVIEW_API_HOST/api/billing/paypal/webhook` and `https://api.zoption.site/api/billing/paypal/webhook`. Subscribe only to the seven subscription lifecycle events (`BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`, `PAYMENT.SALE.COMPLETED`) **plus** the three reversal events `PAYMENT.SALE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, and `CUSTOMER.DISPUTE.CREATED`. The three reversal events are what revoke Pro after a refund, chargeback or dispute; a webhook registered without them leaves the payer entitled after their money is returned. **Re-registration**: a webhook keeps the event set it was created with, so one created before the reversal events existed still carries only the original seven and never receives a refund, chargeback or dispute. Add the missing events in the PayPal dashboard, or use the live setup utility per webhook URL: `pnpm paypal:live:setup --webhook <URL>` reports `update` without changing anything, and `--apply` replaces the event set in place through the PayPal API, so the webhook ID and the deployed `PAYPAL_WEBHOOK_ID` secret stay valid. A duplicate webhook URL or a mismatched product or plan still stops the utility for review. Record the matching webhook ID as the environment secret. Never copy OAuth tokens, webhook headers, payer data, or secret values into source code, tracked configuration, or logs.

    **Dodo Payments (optional second provider).** Dodo Payments is the merchant of record for checkouts started with "Continue with Dodo Payments". It stays unavailable (checkout answers `503 billing_not_configured`) in any environment missing its variables or secrets, and PayPal is unaffected. **Current external state:** the Dodo business "Zoption" exists. In **test mode** (Preview) it has the products `Zoption Pro Monthly` (`pdt_0NoEA8HfvVNl6bUFJDX69`, ₱149 every month) and `Zoption Pro Annual` (`pdt_0NoEBCVETqnXUrInuW5mn`, ₱1,299 every year), both SaaS tax category, tax-exclusive, no trial, and the webhook endpoint `ep_3JjOHc2W7IeQymyaoSXnpvLk2f9` at `https://budget-expense-api-preview.dondon3109.workers.dev/api/billing/dodo/webhook` subscribed to the events below plus `subscription.update_payment_method` (acknowledged and ignored). The Preview `vars` carry these product IDs. Whether the Preview `DODO_PAYMENTS_API_KEY` and `DODO_PAYMENTS_WEBHOOK_KEY` secrets are set is read back with `wrangler secret list --config wrangler.deploy.jsonc --env preview`. In **live mode** (Production), verification is complete and live payments are active; it has the products `Zoption Pro Monthly` (`pdt_0NoEnmPkv8ZLevmzC1W1I`, ₱149 every month) and `Zoption Pro Annual` (`pdt_0NoEqAi0Q6kkOnvC1pWpw`, ₱1,299 every year) with the same settings, and the Production `vars` carry these product IDs with `DODO_PAYMENTS_ENVIRONMENT=live_mode`. The live webhook endpoint `ep_3JlD4Lfn6L0Knid5MJ9eW9l2HrW` is registered at `https://api.zoption.site/api/billing/dodo/webhook` with the same event set; read the Production secrets back with `wrangler secret list --config wrangler.deploy.jsonc --env production`. To enable it for one environment:
    - In the Dodo dashboard, in test mode for Preview or live mode for Production, create two subscription products priced ₱149 monthly and ₱1,299 annually with no trial. Product IDs start with `pdt_`.
    - Add `DODO_PAYMENTS_ENVIRONMENT` (`test_mode` or `live_mode`; Production must be `live_mode`), `DODO_PRO_MONTHLY_PRODUCT_ID`, and `DODO_PRO_ANNUAL_PRODUCT_ID` to that environment's `vars`. `node scripts/validate-deployment-config.mjs` checks them only when one is present: all three are then required, the product IDs must be distinct and start with `pdt_`.
    - Create an API key and store it with `wrangler secret put DODO_PAYMENTS_API_KEY --config wrangler.deploy.jsonc --env <env>`.
    - Register a webhook endpoint at `https://PREVIEW_API_HOST/api/billing/dodo/webhook` or `https://api.zoption.site/api/billing/dodo/webhook` subscribed to `payment.succeeded`, every `subscription.*` lifecycle event (`active`, `updated`, `renewed`, `plan_changed`, `past_due`, `on_hold`, `paused`, `unpaused`, `cancelled`, `failed`, `expired`), `refund.succeeded`, and `dispute.opened`. Store its `whsec_` signing key with `wrangler secret put DODO_PAYMENTS_WEBHOOK_KEY`. The Worker verifies the Standard Webhooks signature with a five-minute timestamp tolerance, then reads the subscription back from the Dodo API before changing access; a full refund or an opened dispute revokes Pro, and a partial refund does not.
    - Dodo redirects the buyer to `WEB_APP_URL/app/settings?checkout=completed` (or `checkout=cancelled`) and appends its own query parameters.

14. Store `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` as a Worker secret in each environment. This is the AES-256-GCM master key that encrypts the AI and voice provider credentials admins save at `/app/admin/provider-configs`. Only ciphertext is written to D1; the key itself never is. Generate a fresh value per environment:

    ```bash
    openssl rand -base64 32 | pnpm --filter @zoption/api exec wrangler secret put PROVIDER_CREDENTIAL_ENCRYPTION_KEY --config wrangler.deploy.jsonc --env preview
    openssl rand -base64 32 | pnpm --filter @zoption/api exec wrangler secret put PROVIDER_CREDENTIAL_ENCRYPTION_KEY --config wrangler.deploy.jsonc --env production
    ```

    The value must base64-decode to exactly 32 bytes. When it is missing or malformed, every credential write fails with HTTP 500 `encryption_not_configured`, so an admin cannot save an API key from the provider admin UI. New ciphertexts are written in the `v1.` format: the prefix records the ciphertext format and the value is bound to its credential row id, so a ciphertext copied to another row cannot be decrypted and a future rotation window can identify rows written under an earlier key. Rows written before the prefix existed carry no binding and still decrypt. That window does not exist yet, so replacing this key today still makes every credential already stored in that environment's D1 undecryptable — never rotate a key that is already in use. Preview and production use separate D1 databases and therefore hold independent keys.

15. Do not add `DEV_ACCESS_TOKEN_ENABLED` to any deployed environment. It gates the local `dummy-dev-access-token` shortcut, defaults off, and is deliberately absent from `apps/api/wrangler.deploy.jsonc`. It belongs only in the ignored `apps/api/.dev.vars` for local development, where the shortcut also requires a non-`production` `POSTHOG_AI_ENVIRONMENT` and an exact loopback request origin (`apps/api/src/auth.ts`), so no deployed origin configuration can arm it.

16. Store `OPS_EGRESS_TOKEN` as a Worker secret in each environment:

    ```bash
    pnpm --filter @zoption/api exec wrangler secret put OPS_EGRESS_TOKEN --config wrangler.deploy.jsonc --env preview
    pnpm --filter @zoption/api exec wrangler secret put OPS_EGRESS_TOKEN --config wrangler.deploy.jsonc --env production
    ```

    `OPS_EGRESS_TOKEN` authenticates outbound automation callers for `GET /api/ops/bug-reports`. It must be set as a **secret**, never a plain `vars` value. The endpoint `GET /api/ops/bug-reports` is the only path the outbound automation may call. The admin bug-report route returns raw content and reporter email and is off limits to this flow.

### Optional PayPal Sandbox provisioning utility

The repository setup utility is intentionally locked to PayPal Sandbox and the approved Preview Worker webhook endpoint. It never calls the live PayPal API, patches/deletes existing resources, or changes Cloudflare by itself. It reconciles the `Zoption Pro` product, the ₱149 monthly and ₱1,299 annual PHP plans, and the ten-event Preview webhook. A conflicting same-name resource, duplicate webhook, or mismatched webhook event set stops the operation for review.

This utility is only for a deliberate Sandbox Preview configuration. The current Preview deployment intentionally uses PayPal Live, so do not run this utility or copy its Sandbox plans/secrets into that environment unless Preview is explicitly switched to `PAYPAL_ENVIRONMENT=sandbox`. Live Preview resources must be managed in the PayPal Live namespace and its three Worker secrets must come from the matching Preview-specific Live app and webhook.

For a deliberate Sandbox Preview, use the ignored `apps/api/.dev.vars` file for the Sandbox client ID and secret. Run the default non-mutating preflight first:

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

If Preview was deliberately switched to Sandbox, copy only the returned non-secret Sandbox plan IDs into its `vars` block in the tracked `apps/api/wrangler.deploy.jsonc`, set `PAYPAL_ENVIRONMENT=sandbox`, set the exact Preview `WEB_APP_URL`, and keep the Production block unchanged. Confirm the Preview Worker has all three secret names before deployment:

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

The real `apps/api/wrangler.deploy.jsonc` is tracked on purpose and holds only publishable environment-specific deployment metadata, never a credential. Before every assistant release, compare its non-secret assistant settings with `apps/api/wrangler.deploy.example.jsonc`; a secret-only change does not synchronize source code, variables, bindings, or cron configuration.

For the target environment:

1. Run a Wrangler deploy dry run using the real config and explicit `--env`.
2. Run `wrangler secret list` and confirm `DEEPSEEK_API_KEY` exists by name. When PostHog AI Observability is enabled, also confirm `POSTHOG_PROJECT_TOKEN`. This confirms presence, not encrypted values, and never prints the keys.
3. List remote D1 migrations. Stop if migration inspection is denied; do not infer assistant schema or provider readiness from `/health`, which checks only the centralized core API bindings (`DB`, `ALLOWED_ORIGINS`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`) plus a non-mutating D1 query.
4. Create the documented D1 recovery point before applying a pending migration.
5. Perform a full Worker deploy, not another secret-only deployment.
6. Verify the resulting deployment version, the `03:17 UTC` retention cron, public smoke checks, and an authenticated plain/tool-backed assistant response.
7. Verify voice streaming authenticates with a ticket, not a JWT. The clients mint a single-use ticket with `POST /api/app/assistant/voice/ticket` (60-second TTL, rows in `assistant_voice_tickets`, added by `0054_assistant_voice_tickets.sql`) and connect to `/api/app/assistant/voice/stream?ticket=…`. Redemption deletes the row, only a real WebSocket upgrade may redeem it, and an unknown, expired or already redeemed ticket returns `401 invalid_voice_ticket`. A JWT is accepted only from the `Authorization` header, so `?token=` is not a supported credential. In Preview, inspect the raw PostHog `$ai_generation` JSON: each real DeepSeek call should share one random trace ID, create no person profile, contain model/latency/token/finish or safe error metadata, and contain none of the assistant content or internal identifiers listed above. A deterministic assistant response should create no event.

`/health` returns `503` with only `status` and `service` when a core binding or D1 is unavailable. Its log records only a fixed message and error class; binding values, credentials, provider errors, and database error text are never included.

Provider failures emit only a sanitized structured event with `event`, `provider`, `kind`, `reason`, and optional numeric `providerStatus`. Never add prompts, answers, tool arguments/results, account or transaction data, tenant/user/thread/message IDs, JWTs, credentials, headers, exception messages/stacks, or provider response bodies to these logs.

PostHog capture is deferred with Cloudflare `waitUntil()`, bounded to one small batch per provider-backed turn, and protected by a short timeout. Capture failure, disabled/incomplete configuration, or a PostHog outage must not change assistant responses, D1 cleanup, provider error mapping, or `/health`. Roll back capture by setting `POSTHOG_AI_OBSERVABILITY_ENABLED=false` and redeploying the Worker; no database rollback is required.

Safe diagnostic actions:

- `configuration/missing_api_key` or `credentials_rejected` — verify the exact Worker environment and re-put the already validated key without printing it.
- `rate_limit/rate_limited` — investigate DeepSeek account quota or throttling; do not rotate credentials blindly.
- `unavailable/upstream_unavailable` — treat provider `5xx` as an upstream outage.
- `unavailable/fetch_failed` — investigate Worker-to-provider connectivity.
- `invalid_response/request_rejected` or `malformed_response` — verify the request/response contract without logging provider bodies.
- No provider event with an API `500` — investigate D1 migration and repository state.

## Frontend configuration

Build Pages with environment-specific public values. The committed `apps/web/.env.production` sets the production-only API fallback to `https://api.zoption.site`. Preview and staging builds must receive `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` explicitly from the build process; local or production fallbacks are rejected. All deployment API and Supabase values must be exact HTTPS origins without credentials, paths, queries, or fragments. Production must use `https://api.zoption.site`; Preview and Staging must not. The build accepts only a Supabase `sb_publishable_…` or legacy JWT `anon` key and rejects secret/service-role types without echoing the value. Local development leaves `VITE_API_URL` blank and uses the Vite proxy at `http://localhost:8787`: `pnpm --filter @zoption/api dev` binds `127.0.0.1:8787` only, and `pnpm --filter @zoption/api dev:lan` is the explicit opt-in to `0.0.0.0:8787` for testing from a phone on the same Wi-Fi.

The public Android metadata bucket `zoption-android-beta` must allow CORS from the exact Pages origins `https://zoption.site` and `https://www.zoption.site` for `GET`/`HEAD` only. The install page fetch sends `Accept: application/json` and `cache: "no-store"` (browsers may preflight `Accept`, `Cache-Control`, and `Pragma`); those request headers must be listed. Do not use wildcard origins. The source-of-truth policy is `scripts/r2-android-cors.json`; apply it with `wrangler r2 bucket cors set zoption-android-beta --file scripts/r2-android-cors.json`.

The app build derives its Pages CSP from the validated API and Supabase origins, writes those exact origins into `connect-src`, writes the exact Supabase origin into `img-src`, and rejects every wildcard source. The app never fetches the Android release metadata, so `downloads.zoption.site` is not in its policy. Production Pages builds require `VITE_POSTHOG_KEY`; Preview and local builds may omit it. Store the browser-visible project token as the GitHub Actions secret `VITE_POSTHOG_KEY` by running `gh secret set VITE_POSTHOG_KEY` and entering the token at the prompt. Only the exact `VITE_POSTHOG_HOST` origin (currently `https://us.i.posthog.com`) is added to `connect-src`. PostHog operates in cookieless, memory-only mode without setting cookies or creating person profiles. The app sends no `$pageview`; six anonymous funnel events (`signup_viewed`, `signup_submitted`, `app_session_started`, `first_import_committed`, `assistant_consent_granted`, `assistant_first_question`) also fire from the signup and signed-in surfaces, carrying fixed enum values only, no financial or identity detail, and nothing written to the device. Server-side PostHog AI Observability runs only in the Worker, so it adds no browser environment variable, script, request, cookie, or Pages CSP origin. The build verifies that the final `_headers` contains exactly the generated policy before deployment, and the smoke check requires the PostHog origin in Production and in any non-indexed deployment that sets `EXPECTED_POSTHOG_HOST`. Production source maps are disabled in both builds, and a successful build must leave no `.map` files in `apps/web/dist` or `apps/site/dist`. The pre-render theme setup loads from same-origin `/theme-bootstrap.js`; do not reintroduce an inline script or weaken `script-src 'self'`.

Set `ZOPTION_DEPLOY_ENV` explicitly in every Pages build: `production` for the production projects and `preview` or `staging` for non-production projects. The app is never indexable: every response carries `X-Robots-Tag: noindex, nofollow`, and its `robots.txt` allows crawling so crawlers can see that header. Preview/staging site builds keep the public content and production canonicals for realistic review, but force HTML and HTTP `noindex,nofollow`, do not publish `sitemap.xml`, and do not advertise a sitemap in `robots.txt`. Vite embeds public environment variables in the generated assets, so changing `VITE_API_URL` or another `VITE_*` value requires a fresh build before deploying; re-uploading an existing `dist` directory does not update it.

```bash
VITE_API_URL=https://PREVIEW_API_HOST \
VITE_SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PREVIEW_PUBLISHABLE_KEY \
VITE_POSTHOG_KEY=phc_PREVIEW_KEY \
ZOPTION_DEPLOY_ENV=preview \
pnpm --filter @zoption/web build
```

The publishable key is intended for browser use. It does not grant access to D1; the Worker still verifies every access token and chooses tenant scope server-side.

The public site build (`apps/site`) validates its own, smaller configuration in `apps/site/deployment-config.ts`. Production defaults `PUBLIC_API_URL` to `https://api.zoption.site` and `PUBLIC_APP_URL` to `https://app.zoption.site` and rejects anything else; Preview and staging builds must pass both explicitly and must not use the production API. A production Pages build (`CF_PAGES=1`) requires `PUBLIC_POSTHOG_KEY`, which the release workflow fills from the same `VITE_POSTHOG_KEY` secret, and fails if `GET /api/reviews` fails, because the landing page renders the published reviews at build time. `scripts/finalize-build.mjs` then writes `dist/_headers`: a CSP of `script-src 'self'` plus a SHA-256 hash for each inline script Astro emitted (the island bootstrap), `connect-src` limited to the site, the API, and `https://downloads.zoption.site`, a `Speculation-Rules` header for same-origin prefetch, and cache rules (`/_astro/*` immutable for a year, brand and social images for a day, discovery files for an hour, `release.json` never). Site analytics posts to the same-origin `/ingest` Pages Function, which forwards only PostHog capture endpoints to `us.i.posthog.com` and strips cookies and client address headers.

```bash
PUBLIC_API_URL=https://PREVIEW_API_HOST \
PUBLIC_APP_URL=https://PREVIEW_WEB_HOST \
ZOPTION_DEPLOY_ENV=preview \
pnpm --filter @zoption/site build
```

Public canonical URLs do not use trailing slashes, and the legal, pricing, FAQ, install, and changelog trailing-slash variants permanently redirect to their canonical path. Every public page is static HTML with a query-free canonical, so any query string consolidates onto the clean URL. Analytics counts a view only when the query carries nothing but standard UTM and ad-click identifiers (`utm_*`, `gclid`, `dclid`, `fbclid`, `msclkid`) and the fragment carries no auth state. Update a public route's manually maintained sitemap `lastModified` value only when its user-visible content changes materially; the same value feeds legal-page structured-data `dateModified`.

## Merging pull requests

The only routine human checkpoint is approving the `production` environment of a release. Merging is automatic once the required checks pass, and a human review is required only for the paths below.

**Required checks** (the `main CI gate` ruleset): `static`, `unit`, `e2e`, `dependency-review`, `codeql`, and `migration-safety`. The first five are jobs in `ci.yml` and `migration-safety` is its own workflow (`.github/workflows/migration-safety.yml`). `claude-review` is not required: it exists only for the bugfix bot's pull requests, so requiring it would block every other pull request. `dependency-review` fails on a newly added dependency with a high severity advisory and is never skipped on a pull request or a dispatched bugfix run, because a skipped required check counts as passing; it skips only on a push to `main`. `codeql` analyses JavaScript and TypeScript. E2E retries twice on CI only (`playwright.config.ts`).

**Code owners** (`.github/CODEOWNERS`, owner `@dondon3109`) cover only these paths, and the ruleset requires Code Owner review for them: `/.github/`, `/scripts/`, `/release.config.mjs`, `/db/`, `/drizzle.config.ts`, `/supabase/`, `/apps/api/wrangler*.jsonc`, `/apps/site/wrangler.jsonc`; authentication and credentials in the API (`auth.ts`, `composition.ts`, `provider-credentials/`, `db/provider-credentials.ts`, `db/provider-configs.ts`, `db/tenants.ts`, the provider-credentials, admin provider-configs, and platform-admin routes, `platform-admin.ts`); billing (`billing/`, `db/billing.ts`, the billing, PayPal webhook, and Dodo webhook routes); the Supabase clients and session handling (`apps/web/src/lib/supabase.ts`, `apps/mobile/src/auth/`); and `AGENTS.md` and `CLAUDE.md`. `package.json` and `pnpm-lock.yaml` are deliberately not owned, so npm updates can merge on green CI.

**Auto-merge** (`.github/workflows/auto-merge.yml`) runs on `pull_request` (never `pull_request_target`, and it checks out no code) when a pull request opens, reopens, or becomes ready for review, and runs `gh pr merge --auto --squash` for:

- the maintainer's own pull requests;
- the bugfix bot's pull requests (`github-actions[bot]`, branch `bugfix/*`), only on `ready_for_review` and only when the maintainer is the actor. Those pull requests open as drafts and a draft cannot be armed, so the maintainer's "Ready for review" click is the human review of bot-written code;
- Dependabot pull requests whose every updated dependency (read from the whole `updated-dependencies-json` list, not a single summary value) is a patch or minor update. A major update is never armed.

It arms with the `AUTO_MERGE_TOKEN` secret, a fine-grained personal access token of the maintainer with contents and pull requests write access to this repository, stored both as an Actions secret and as a Dependabot secret (Dependabot-triggered runs read only Dependabot secrets). The workflow's own `github.token` cannot do this job: GitHub starts no workflow for a push made with it, so a pull request merged that way never ran CI on `main` and never reached `Production Release`. Check both copies with `gh secret list` and `gh secret list --app dependabot`; when the token expires, arming fails in the `arm` job and nothing merges until it is replaced with `gh secret set AUTO_MERGE_TOKEN` and `gh secret set AUTO_MERGE_TOKEN --app dependabot`.

Arming only queues the merge. GitHub completes it when every required check has passed and, for a pull request that touches a code-owned path, the owner has approved. Dependabot action updates always touch `.github/`, so they wait for the maintainer. Dependabot opens one grouped pull request a week for `github-actions` and one for npm minor and patch updates; each major npm update is its own pull request.

Merges are squash-only. The squash commit is created and signed by GitHub, so unsigned commits on a branch such as the bugfix bot's should not block a signed-commits rule. Verify that on the first bugfix pull request after enabling it; if it blocks, have the bugfix job create its commit through the GraphQL `createCommitOnBranch` mutation, which GitHub signs.

### Migrations: expand, then contract

Migrations run before the new Worker serves traffic and are never rolled back, so the Worker one release back must keep working against every migration in a release. That rules out a destructive change in one step:

1. **Expand:** add the new column, table, or index, nullable or defaulted, and ship code that writes both shapes and reads the new one with a fallback.
2. **Migrate:** backfill in a later migration once no running version depends on the old shape.
3. **Contract:** drop or rename the old shape in a release after every deployed Worker and every supported mobile sync contract has stopped using it.

`migration-safety` fails a pull request that adds a migration under `db/migrations/` or `supabase/migrations/` containing `DROP` or `RENAME` (comments ignored), unless the pull request carries the `destructive-migration` label. The label is the contract step's deliberate acknowledgement; applying or removing it reruns only that check. Migrations are code-owned, so the maintainer reviews every one regardless.

## Automated production release

CI validates every pull request and push to `main` in five parallel jobs, the last two described under [Merging pull requests](#merging-pull-requests): `static` (dependency audit, lint, format, typecheck, and `actionlint` over the workflows, pinned by version and checksum), `unit` (Vitest and mobile Jest), `e2e` (shared and API builds, preview and production builds of the app and the public site, Playwright against the app, site, and API dev servers, then Lighthouse against the production site build; a failed run keeps the Playwright report and traces as an artifact for seven days), `dependency-review`, and `codeql`. A new push to a pull request cancels that pull request's running CI; runs on `main` are never cancelled. Every job installs through the `.github/actions/setup` composite action, which takes pnpm's version from `packageManager` in `package.json`. Dependabot (`.github/dependabot.yml`) moves the SHA-pinned actions and the npm dependencies forward in weekly grouped pull requests. It skips the Expo-managed mobile packages (`expo`, `expo-*`, `@expo/*`, `react-native*`, `@react-native/*`, `jest-expo`, `babel-preset-expo`), React and its types, and Babel majors; those move with `npx expo install --fix` or an Expo SDK upgrade. The ignore rules name `update-types`, so they skip only version updates and Dependabot security updates still open for those packages. The `Production Release` workflow is the only normal production deployment authority: it runs from the successful `CI` workflow result for a push to `main` and decides in two jobs. The ungated `preflight` job fails at its `Verify release source` guard when `main` has already moved past the CI commit, and otherwise asks semantic-release whether the unreleased Conventional Commits require a release. A superseded result therefore fails before the `production` environment gate is reached and never requests an approval, while a non-releasing change ends in `preflight` without starting the deploy job. Only a current result that owes a release starts the ungated `preview` job, which rehearses the release on the preview stack (see [Preview release](#preview-release)), and only after it passes does `deploy-and-release` start, which runs in the `production` environment, requires a reviewer, and performs the migration and the Worker and both Pages deploys once a human approves, after which the `publish-release` job runs semantic-release. No approval is ever requested for a run that could only do nothing. A run already waiting for approval when `main` moves is cancelled at once by the `Cancel Superseded Releases` workflow (`.github/workflows/release-superseded.yml`), which runs on every push to `main`; approving it could only fail the deploy job's `Verify release source` guard.

Before the approval request appears, the ungated `approval-summary` job (it holds no write or Cloudflare token) writes the run summary the approver reads and sends it to Telegram. The summary lists the changes since the last release tag with bot-authored ones marked (a commit author or noreply email ending in `[bot]`, which covers the bugfix bot and Dependabot), every new D1 migration with its SQL, the changed files that match a `CODEOWNERS` pattern, the preview deploy and smoke result, the production bundle's sha256, and a link to its provenance attestation. `deploy-and-release` needs this job, so an approval request never appears without the summary.

Approvals are batched: the gated job shares the `production` concurrency group with `Production Rollback`, and a run parked at the gate for an older commit is cancelled by the `cancel-superseded` job of a newer run and by `Cancel Superseded Releases`, so several merges are approved once, for the newest `main`.

Preview and production are two builds on purpose. Vite bakes the environment into a bundle (`VITE_API_URL`, the Supabase URL and publishable key, and the PostHog key; the emitted CSP lists a PostHog origin only when it is set), so one bundle cannot be correct for both. `build-production` builds the production bundle once, before approval, hashes it, and attests its provenance with `actions/attest-build-provenance` (the job holds `id-token: write` and `attestations: write` for that only); the gated job deploys those exact bytes after re-verifying the hash.

Privileges: only `preflight` (semantic-release's dry run authenticates a push) and `publish-release` hold `contents: write`. `publish-release` runs after `deploy-and-release` succeeded, holds no Cloudflare token, and sits in no environment, so it asks for no second approval. The Cloudflare token is read only by jobs in the `preview` or `production` environment.

For a release-producing commit, the workflow uses one version and commit SHA throughout this sequence:

1. Validate the tracked production Wrangler configuration and perform a Worker dry run.
2. Create or resume a GitHub production deployment record for duplicate protection.
3. Record the D1 Time Travel bookmark (`.github/actions/d1-restore-point`) in the job log and run summary with the exact restore command (`wrangler d1 time-travel restore DB --bookmark=<bookmark> --config wrangler.deploy.jsonc --env production`, run from `apps/api`), then apply pending production D1 migrations. Time Travel keeps 30 days of history on Workers Paid (7 on Free), so the bookmark is the restore point if a migration damages data; restoring discards every write made after it.
4. Roll the production Worker out gradually (`scripts/worker-canary.mjs`). Before anything deploys, `plan` reads the live deployment (it refuses to start while production is already split across two versions) and confirms the Cloudflare token can read Workers analytics. The release uploads a new version tagged with the semantic version (`wrangler versions upload --strict`), deploys it at 0%, and `probe` sends version-pinned requests (`Cloudflare-Workers-Version-Overrides`) that must reach it: `/health` reports the serving version from the `CF_VERSION_METADATA` binding, and the private API must still answer `401`. It then serves 10% of traffic for the dwell time, probed every 30 seconds, after which the new version's invocation error rate (Workers analytics by `scriptVersion`) may exceed the old version's by at most the configured margin. The dwell and thresholds are repository variables: `CANARY_DWELL_MINUTES` (default 10), `CANARY_MAX_EXTRA_ERROR_POINTS` (percentage points, default 1), and `CANARY_MIN_REQUESTS` (default 50). With fewer requests than the minimum on the new version the error rate is not judged and the probes decide alone: the release is promoted, the job summary carries a warning, and the "live" Telegram message repeats it. If the analytics cannot be queried after the dwell, the step fails closed, the summary says so, and the automatic rollback runs. Then it goes to 100% and `wrangler triggers deploy` applies routes, the custom domain, and cron triggers, which a version upload leaves alone. A release that changes Durable Object migrations or queue consumers since the last release tag deploys atomically with `wrangler deploy` instead, because Cloudflare applies those only on a full deploy.
5. Deploy the app to `clarity-budget` with the exact Git SHA, then the public site to `zoption-site` from `apps/site`, so its `/ingest` Pages Function is included. Both were built with that same version before approval by the ungated `build-production` job, which runs beside `preview`, hashes every output file into a manifest, and uploads them as the `production-dist` artifact (kept 30 days). The gated job downloads it and refuses to deploy unless the recomputed manifest hash matches the one `build-production` reported, so production gets exactly the bytes that existed at approval. The site build reads the published reviews from the live production API, so `/api/reviews` must keep its response shape for one release; the build fails rather than ship without them. Every Pages upload, preview and production, goes through `.github/actions/pages-deploy`, which retries a failed upload once after 15 seconds. Each deploy is checkpointed (`worker`, `pages`, `site`) so a rerun skips what already shipped.
6. Wait until both custom domains serve the versioned `release.json` marker, and run the non-mutating production smoke gate against the site, the app, and the API.
7. Mark the GitHub deployment successful. Then, in the separate `publish-release` job, let semantic-release create the matching `v*` tag and GitHub Release.
8. Send a Telegram message through `.github/actions/notify` (the bot the bugfix automation uses, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`): the release is waiting for approval (with the run link and a short batch summary), live (with the canary warning when it applies), failed on preview, failed in production with or without a successful automatic rollback, or deployed but not published. Messages carry versions, status, and the run link only. Cloudflare's Workers Metrics charts mark every Worker release and gradual rollout on their own.

Setting the repository variable `PRODUCTION_DEPLOY_FREEZE=true` holds every release at the first `preflight` step, before any approval is requested; unset it and rerun to resume. The `Production Rollback` workflow ignores it.

If any step fails after the run has touched the Worker (a failed canary, Pages deploy, propagation wait, or smoke check), the job rolls production back automatically to the release it replaced (`preflight` resolves it from the newest reachable `v*` tag) through the same `.github/actions/rollback-production` steps the `Production Rollback` workflow uses, then records a `rolled-back` deployment status so a rerun deploys every stage again instead of resuming past them. It crosses this release's migrations without asking, because every migration must already work with the Worker one release back. The run still fails and no tag is published.

If semantic-release publication fails after a successful Cloudflare deployment, rerunning the failed `publish-release` job while that commit is still `main` reuses the successful GitHub deployment record and does not deploy the Worker or either Pages project again. Semantic-release is also idempotent once the tag exists.

Version selection remains:

- `fix:` creates a patch release.
- `feat:` creates a minor release.
- `feat!:` or a `BREAKING CHANGE:` footer creates a major release.
- Documentation, tests, chores, refactors, CI, build, style, performance, and unknown commit types do not release.

Before enabling the workflow for the first time, create the missing one-time baseline tag on the existing `2.2.1` release commit and push only that tag:

```bash
git tag -a v2.2.1 203ef8c -m "Release 2.2.1"
git push origin v2.2.1
```

The workflow only requires that a valid prior `vMAJOR.MINOR.PATCH` tag is reachable from the release commit. This protects the one-time migration without permanently embedding `2.2.1` in the workflow; it does not compare future releases with `package.json` or require agents to edit versions.

### One-time operator setup

Do these outside the repository before enabling `Production Release`; the workflow deliberately does not change external settings:

1. In Cloudflare Workers Builds for `budget-expense-api-production`, disable the production Git-connected deployment from `main`. Remote verification on 2026-08-17 showed that it deployed `203ef8c` even though GitHub CI failed. Keep it disabled to prevent a duplicate Worker deployment racing GitHub Actions.
2. Stop routine manual production Worker and Pages deployments. The commands below are retained only for emergency recovery when the Actions workflow is disabled.
3. Add the GitHub Actions secret `CLOUDFLARE_API_TOKEN` with only the account permissions needed for Workers Scripts, Pages, and D1 production deployment, plus Account Analytics: Read for the Worker canary. Existing Worker runtime secrets stay in Cloudflare and are neither copied to nor exposed by GitHub Actions.
4. Add the GitHub Actions variable `CLOUDFLARE_ACCOUNT_ID`.
5. After completing steps 1-4, add `CLOUDFLARE_PRODUCTION_GIT_DEPLOY_DISABLED=true`. The workflow refuses to deploy without this explicit operator acknowledgement.
6. Allow the workflow's `GITHUB_TOKEN` to write contents and deployments, and keep `main` protected. The rules are external state, so read them back rather than trusting this list:

   ```bash
   gh api repos/dondon3109/Budget-and-expense-analysis-tool/rulesets \
     --jq '.[] | {id, name, enforcement, bypass_actors}'
   ```

   - **main integrity - no rewrite, no delete** (`23728450`): refuses deletion and non-fast-forward pushes on `refs/heads/main`, with no bypass actors.
   - **main review gate - PR required** (`23728455`): requires a pull request for `refs/heads/main` with one approving review, and dismisses an approval when a new commit is pushed. The maintainer's user (`dondon3109`) is its only bypass actor, in `always` mode, so the maintainer can merge their own pull request without an approval its author cannot give.
   - **main CI gate - checks required** (`23980221`): requires the `static`, `unit`, and `e2e` checks from GitHub Actions (integration `15368`) on `refs/heads/main`, with no bypass actors. Nothing merges on red CI, including through the maintainer's review bypass. A direct push to `main` is refused unless that exact commit already passed the checks on a branch, so every change, including the post-release `CHANGELOG.md` commit, goes through a pull request.

   The bypass and the count of one are deliberate. On 2026-09-21, with no bypass and `required_approving_review_count` 0, reopening PR #22 — the `zoption-bug-automation` app's own proof that it could not merge itself — reported `mergeable MERGEABLE` and no review decision, so `require_extra_approval_for_unattributed_changes` alone does not keep an app-authored pull request behind a human. One required approval plus the maintainer bypass is what does.

   Classic branch protection on `main` is enabled as well, with force pushes and deletions disabled and `enforce_admins` on. It requires no status checks; the CI gate ruleset does.

   Repository auto-merge is enabled (`allow_auto_merge`); `auto-merge.yml` arms it for the pull requests described under [Merging pull requests](#merging-pull-requests). Read it back with `gh api repos/dondon3109/Budget-and-expense-analysis-tool --jq .allow_auto_merge`.

7. Require a reviewer on the `production` environment. It is what keeps a push to `main` — from any identity, including the maintainer's own bypass — from reaching production without a human click. It is external state, so read it back:

   ```bash
   gh api repos/dondon3109/Budget-and-expense-analysis-tool/environments \
     --jq '.environments[] | {name, protection_rules}'
   ```

   Leave "Prevent self-review" off. The maintainer is the only human and is the actor on his own merges, so enabling it would leave every production deployment unapprovable.

   The environment also accepts deployments only from `main` (a custom deployment branch policy, set 2026-10-05). `Production Release` always runs on `main`; `Production Rollback` must be dispatched from `main`, and a run dispatched from any other branch fails before it reaches the approval, so a pushed branch cannot carry its own workflow file to production. Read it back:

   ```bash
   gh api repos/dondon3109/Budget-and-expense-analysis-tool/environments/production \
     --jq .deployment_branch_policy
   gh api repos/dondon3109/Budget-and-expense-analysis-tool/environments/production/deployment-branch-policies \
     --jq '[.branch_policies[] | {name, type}]'
   ```

   The workflows read `CLOUDFLARE_API_TOKEN` only in jobs that name the `preview` or `production` environment (a test in `scripts/release-workflow.test.mjs` pins this for `release.yml`). For that to protect anything, store the token as an environment secret of `production`, and a separate preview token as an environment secret of `preview` (which needs no reviewer and is limited to `main`), then delete the repository-level secret. While it is still a repository secret, a workflow on any branch can read it without this environment; the branch policy guards the approval path, not the token.

The Pages build derives its public Supabase URL and publishable key from the existing tracked production Wrangler configuration. Do not add service-role keys, provider API keys, or other Worker runtime secrets to GitHub.

## Preview release

Every release is rehearsed on preview automatically. The `preview` job in `Production Release` runs after `preflight` for every commit that owes a release and before `deploy-and-release` can ask for approval. It exports the preview values with `node scripts/export-deployment-env.mjs preview`, applies the preview D1 migrations, deploys the preview Worker (without `--strict`; the tracked config always wins in preview), builds and deploys the app to `clarity-budget-preview` and the public site to `zoption-site-preview` with the release version, waits for both to serve it, and runs the smoke gate with `EXPECT_SEARCH_INDEXING=0`. Preview builds omit PostHog. A preview failure stops the release before any production approval is requested; fix forward with a pull request.

The preview hosts are fixed: the API at `https://budget-expense-api-preview.dondon3109.workers.dev`, the app at `https://clarity-budget-preview.pages.dev` (the preview `WEB_APP_URL`), and the site at `https://zoption-site-preview.pages.dev`. The preview `ALLOWED_ORIGINS` includes the preview site so its support chat preflight passes, and the site build rewrites its `_redirects` to hand app paths to the preview app.

One-time setup: the `zoption-site-preview` Pages project must exist (`pnpm --dir apps/api exec wrangler pages project create zoption-site-preview --production-branch=main`). The preview Worker secrets are the ones listed above for `--env preview`.

The manual commands below are for running preview outside the workflow. Create a D1 Time Travel recovery point before applying migrations that remove retired data, then apply migrations and deploy the Worker. The tracked Preview environment overrides the root cron list to omit daily interest crediting: Preview keeps billing reconciliation and daily maintenance, while Production retains all three schedules. This also keeps the current Cloudflare account within its account-wide Cron Trigger quota.

```bash
node scripts/validate-deployment-config.mjs
cd apps/api
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.deploy.jsonc --env preview
pnpm exec wrangler deploy --config wrangler.deploy.jsonc --env preview
```

Inspect the preview database after migration: the retired public tenant should be absent, while authenticated user tenants and their records must remain unchanged.

Build and deploy the browser app:

```bash
VITE_API_URL=https://budget-expense-api-preview.dondon3109.workers.dev \
VITE_SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PREVIEW_PUBLISHABLE_KEY \
VITE_POSTHOG_KEY=phc_PREVIEW_KEY \
ZOPTION_DEPLOY_ENV=preview \
pnpm --filter @zoption/web build
pnpm --dir apps/api exec wrangler pages deploy ../web/dist --project-name=clarity-budget-preview --branch=main
```

Build and deploy the public site from `apps/site`, so the `/ingest` function deploys with it:

```bash
PUBLIC_API_URL=https://budget-expense-api-preview.dondon3109.workers.dev \
PUBLIC_APP_URL=https://clarity-budget-preview.pages.dev \
ZOPTION_DEPLOY_ENV=preview \
pnpm --filter @zoption/site build
cd apps/site && ../api/node_modules/.bin/wrangler pages deploy dist --project-name=zoption-site-preview --branch=main && cd ../..
```

Run the non-mutating smoke gate (the exported values are the preview hosts and Supabase origins):

```bash
GITHUB_ENV=/tmp/preview.env node scripts/export-deployment-env.mjs preview
env $(cat /tmp/preview.env) pnpm smoke:production
```

`EXPECTED_SUPABASE_URL` is required. `EXPECTED_POSTHOG_HOST` is required unless `EXPECT_SEARCH_INDEXING=0`; drop that line when the Preview build omitted `VITE_POSTHOG_KEY`, because its CSP then has no PostHog origin. Set `FORBIDDEN_SUPABASE_ORIGINS` to the other deployment's distinct Supabase origin and add any custom-domain origins that must be absent. The smoke gate rejects every CSP wildcard source and, for managed `*.supabase.co` projects, rejects every managed Supabase origin other than the expected one. It also confirms the frontend bundle embeds the expected API and Supabase origins and none of the explicitly forbidden origins.

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

After Preview and authenticated checks pass, merge a release-producing Conventional Commit into protected `main`. The successful push `CI` run starts `Production Release`: its ungated `preflight` job fails at `Verify release source` when `main` has moved on, and otherwise proceeds only when semantic-release finds a release owed, so a superseded or non-releasing commit never reaches `production` environment approval. Only when both hold does `deploy-and-release` run, and it waits for that approval before it migrates, deploys, or publishes. Operators approve and monitor the workflow rather than run Wrangler locally. The production Wrangler environment declares `api.zoption.site` as its custom domain and allows `app.zoption.site`, `zoption.site`, and `www.zoption.site` (the site calls the public reviews and support chat routes).

The following commands are emergency recovery references only. Disable or wait for the Actions deployment before running them; never use them concurrently with `Production Release` or while Cloudflare's old Git deployment is enabled.

```bash
node scripts/validate-deployment-config.mjs
cd apps/api
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.deploy.jsonc --env production
pnpm exec wrangler deploy --config wrangler.deploy.jsonc --env production
cd ../..
```

For an emergency Pages recovery, build and deploy the app with production Supabase values, then the public site. `VITE_API_URL` defaults to `https://api.zoption.site`. Set `ZOPTION_DEPLOY_ENV=production`; the web build rejects Cloudflare Pages builds without this explicit environment value so a preview project cannot accidentally publish indexable pages.

```bash
VITE_SUPABASE_URL=https://PRODUCTION_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PRODUCTION_PUBLISHABLE_KEY \
VITE_POSTHOG_KEY=phc_APPROVED_POSTHOG_KEY \
ZOPTION_DEPLOY_ENV=production \
pnpm --filter @zoption/web build
pnpm --dir apps/api exec wrangler pages deploy ../web/dist --project-name=clarity-budget --branch=main
ZOPTION_DEPLOY_ENV=production PUBLIC_POSTHOG_KEY=phc_APPROVED_POSTHOG_KEY CF_PAGES=1 \
pnpm --filter @zoption/site build
cd apps/site && ../api/node_modules/.bin/wrangler pages deploy dist --project-name=zoption-site --branch=main && cd ../..
SITE_URL=https://zoption.site \
APP_URL=https://app.zoption.site \
API_URL=https://api.zoption.site \
EXPECTED_SUPABASE_URL=https://PRODUCTION_PROJECT_REF.supabase.co \
FORBIDDEN_SUPABASE_ORIGINS=https://PREVIEW_PROJECT_REF.supabase.co \
EXPECTED_POSTHOG_HOST=https://us.i.posthog.com \
pnpm smoke:production
```

Verify the three production web origins appear in `ALLOWED_ORIGINS` and the app callback is in Supabase's redirect allow-list before inviting users. The public site serves every manifest route as static HTML plus `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/llms-full.txt`, and a branded `404.html`; its `_redirects` hands `/login`, `/signup`, `/auth/*`, `/app/*`, `/thank-you`, `/shared/budget/*`, and the legacy workspace paths to `app.zoption.site` with the query string intact. The app's `_redirects` serves `index.html` for every path, redirects legacy workspace paths to `/app`, and sends public page paths back to `zoption.site`. The site counts cookieless pageviews after consent; the app sends only the six anonymous funnel events. Confirm neither origin loads the Cloudflare Web Analytics beacon or GA4.

The normal workflow publishes semantic release metadata automatically only after both Cloudflare deployments and smoke verification succeed. Do not create a release tag manually after automation is enabled.

## Rollback

A release that fails after touching production rolls itself back (see [Automated production release](#automated-production-release)). The `Production Rollback` workflow (`.github/workflows/rollback.yml`) is the normal rollback for a release that passed its checks and turned out bad later. Both run `.github/actions/rollback-production`. Run it from the Actions tab with the released `version` to restore and a `reason`; it waits for approval in the `production` environment and shares the release's concurrency group, so it never overlaps a deploy. It rolls back `clarity-budget` and `zoption-site` to the production deployments built from the `v<version>` commit (`scripts/rollback-pages.mjs`), then the Worker to the version tagged `v<version>`, waits for both domains to serve that version's `release.json`, and runs the production smoke gate. It refuses when D1 migrations were added after that version unless `allow_newer_migrations` is set, and it fails closed when the target is older than the last 100 Pages deployments or the Worker's recent version list. The next release from `main` deploys forward again, so fix forward with a normal pull request.

Manual rollback, when the workflow cannot run:

- **Pages:** promote the previously verified deployment of each project (`clarity-budget` for the app, `zoption-site` for the public site).
- **Worker:** roll back to the previous Worker version, but do not roll code back past an incompatible D1 migration.
- **D1:** migrations are forward-only, and the rollback workflow never touches data. Each release run's summary records the Time Travel bookmark taken right before its migrations, for preview and production, with the restore command. Restore only when a migration damaged data, because it discards every write made after the bookmark; rehearse it on the preview bookmark first. Because migrations run before the Worker deploy, every migration must stay compatible with the previously deployed Worker; [Migrations: expand, then contract](#migrations-expand-then-contract) states the rule.
- **Supabase Auth:** do not rotate or remove signing keys as an application rollback mechanism. Follow Supabase key-rotation guidance and keep old keys valid through their transition window.
- After rollback, rerun the documented environment-specific smoke command with `EXPECTED_SUPABASE_URL` (and any distinct `FORBIDDEN_SUPABASE_ORIGINS`) and verify unauthenticated `/api/app/*` requests still return `401`.

## Production monitoring

The `Production Monitor` workflow (`.github/workflows/production-monitor.yml`) runs the read-only production smoke gate every 10 minutes and on demand. A pass that fails is retried after a minute; a second failure opens one issue labelled `production-down`, assigned to the repository owner so GitHub notifies them, and later failures comment on that issue. The next passing check closes it. The workflow needs no secrets: it reads the production hosts and Supabase origins from `scripts/export-deployment-env.mjs`. GitHub delays scheduled runs under load and disables them after 60 days without repository activity; re-enable it from the Actions tab if that happens.

## Custom-domain verification

Before treating the domain migration as complete:

1. Confirm `zoption.site` is attached to the `zoption-site` Pages project, `app.zoption.site` to `clarity-budget`, and that no Worker route or Worker Custom Domain claims either host. If `https://zoption.site/health` returns the API health response, the apex is still routed to the Worker.
2. Deploy the production Worker with `apps/api/wrangler.deploy.jsonc` so its Custom Domain is `api.zoption.site`, then confirm `https://api.zoption.site/health` returns `200`.
3. Add `www.zoption.site` to the `zoption-site` project and configure the canonical redirect, or remove the alias from `ALLOWED_ORIGINS` if it will not be served.
4. Run the Production smoke command above, including `EXPECTED_SUPABASE_URL`, after DNS and custom-domain changes have propagated.

## Search visibility verification

After the apex redirect, public metadata, and production smoke checks pass:

1. Verify `https://zoption.site` as the canonical Google Search Console property and verify the same canonical host in Bing Webmaster Tools. Bing uses the XML file method: `apps/site/public/BingSiteAuth.xml` is served at `https://zoption.site/BingSiteAuth.xml`; keep it deployed or Bing drops the verification.
2. Submit `https://zoption.site/sitemap.xml` to both services.
   Bing also gets IndexNow pings: `apps/site/public/f5c64240721195163af5a0371f83e9dc.txt` is the public key file, and the `Submit URLs to IndexNow` step in `Production Release` (`scripts/submit-indexnow.mjs`) posts every sitemap URL to `api.indexnow.org` after each deploy. It is `continue-on-error`, so a failed ping never blocks a release. Keep the key file deployed.
3. Run the [Schema.org Markup Validator](https://validator.schema.org/) for `/` and each legal page. Confirm every public response has one linked graph using `https://zoption.site` canonical IDs: `WebApplication` on the homepage and `WebPage` on legal pages.
4. Run Google's [Rich Results Test](https://search.google.com/test/rich-results) as a diagnostic, but do not fabricate offers, pricing, reviews, or ratings to seek eligibility. Zoption intentionally publishes no organization/person, breadcrumb, FAQ, local-business, search-action, or bank-affiliation markup until corresponding visible, verified content exists.
5. Inspect the rendered HTML and Search Console URL Inspection result for `/` and each legal page. Confirm the canonical points to `https://zoption.site`, Open Graph tags reference the social image, the structured-data graph is present, and the page is indexable.
6. Confirm `/login`, `/auth/callback`, and `/app/*` return `X-Robots-Tag: noindex, nofollow`, do not emit managed JSON-LD, and do not enter the sitemap.
7. Recheck the Coverage, Core Web Vitals, and Performance reports after new or materially updated public content is released.

## Outbound bug report egress automation

The endpoint `GET /api/ops/bug-reports` is the only path the outbound automation may call.

- Outbound automation must authenticate using the `OPS_EGRESS_TOKEN` binding as a Bearer token in the `Authorization` header. It must be set as a **secret** in each Worker environment (`wrangler secret put OPS_EGRESS_TOKEN`), never a plain `vars` value.
- The admin bug-report route (`/api/app/admin/bug-reports`) returns raw content and reporter email and is off limits to this flow.
- The list mode returns only reports that are `new` or `triaged`, have no `bug_report_egress_audit` row, and are not a repeat of an earlier report from the same tenant with the same title and actual behavior (a double submission gets one fix, not two). Crossing sets a `new` report to `in_progress`; resolving it after the fix PR merges is done by hand in the admin UI. A caller keeps no record of what it handled, so a retry is safe. `?id=<reportId>` re-reads one report that already crossed, running the same redaction again.
- **Reading a report claims it.** The list writes an audit row for every report it returns, which is what makes it exactly once, so a caller must handle everything it receives and there is no way to look at the queue without consuming it.
- `?limit=<1..100>` caps how many reports one poll claims. It is the caller's throttle: whatever it does not ask for stays unclaimed for the next poll. The default is 100.

### The chain

1. The Production API Worker's five-minute cron checks every third tick (minutes 0, 15, 30, and 45 UTC) for a report the list mode would offer. When one is waiting it dispatches `.github/workflows/bugfix.yml` on `main` with no report id, using `GITHUB_BUGFIX_DISPATCH_TOKEN`; reading the queue claims nothing, and the dispatch carries no report detail. The workflow's `claim` job calls the endpoint with `?limit=1`, so one dispatch claims at most one clean report and starts at most one coding agent run. Raise the limit deliberately rather than by default. Claiming and drafting in one run means a claimed report is never lost between a poll and a draft. A manual `workflow_dispatch` without `bug_report_id` claims the next report the same way. With `bug_report_id` it drafts that report, which is how a report whose run failed gets retried.
2. The `draft` job runs with `permissions: contents: read`. It fetches that report by id, runs Claude Code headless (`claude -p`, model `claude-opus-5-5`, on the Claude Pro subscription) with file tools and `pnpm vitest run` only, checks its own output with `scripts/bugfix-scrub.mjs`, and uploads `fix.patch`, `pr-body.md`, and `meta.json` as the `bugfix-draft` artifact.
3. The `open-pr` job applies the patch to `bugfix/<report id>` and opens a draft pull request, then starts `ci.yml` explicitly: a pull request opened with the run token does not trigger `pull_request` workflows, and `workflow_dispatch` is the documented exception.
4. The `notify` job sends a Telegram message with the pull request link, the shadow mode run link, or the failure. It carries status and links only, never report text, and does nothing while the Telegram secrets are unset. A tick that claims nothing sends nothing, and a failed `claim` job surfaces only as a failed scheduled run.
5. A human reviews and merges. The `main review gate - PR required` ruleset requires one approving review and the `main CI gate - checks required` ruleset requires passing CI. Once the maintainer marks the draft ready for review, PR Review posts a Claude review comment; it never approves or merges. The release pipeline takes over.

The drafting job is the only job that reads user text, and it holds no write token. The `open-pr` job holds the write token, runs no model, and reads no user text. No credential outside a runner can write to the repository. The Worker's dispatch token can only start a workflow run, so n8n, the fork, the organization, and the GitHub App are all gone.

The workflow has no GitHub `schedule` trigger. GitHub never fired one for this repository, so the Worker's cron is the timer.

The `pull_request` CI run on a draft pull request opened by `github-actions[bot]` waits for maintainer approval (`action_required`). That hold is intentional: approving it is the human checkpoint before workflow code runs on agent-written changes under the pull request event. The required `static`, `unit`, and `e2e` checks come from the CI run that `open-pr` dispatches, so the hold never blocks a merge.

### External state this depends on

Read every one of these back after a change. None of them live in the repository.

| Setting                        | Where it lives                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Read it back                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `OPS_EGRESS_TOKEN`             | Worker secret, plus a repository secret the claim and draft jobs read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `pnpm exec wrangler secret list` in `apps/api`; `gh secret list`                               |
| `CLAUDE_CODE_OAUTH_TOKEN`      | Repository secret from `claude setup-token`, read by Claude Code in the draft job. Drafts share the Pro usage limits, and the token has no spend cap, so revoke it at any sign of misuse                                                                                                                                                                                                                                                                                                                                                                                          | `gh secret list`                                                                               |
| `TELEGRAM_BOT_TOKEN`           | Repository secret, the bot created with @BotFather                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `gh secret list`                                                                               |
| `TELEGRAM_CHAT_ID`             | Repository secret, `message.chat.id` from the bot's `getUpdates` after you message it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `gh secret list`                                                                               |
| `OPEN_BUGFIX_PRS`              | Repository variable, set to `true` (draft pull requests open). Unset is shadow mode, where the draft stays an artifact                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `gh variable list`                                                                             |
| `OPS_API_BASE_URL`             | Optional repository variable, defaults to `https://api.zoption.site`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `gh variable list`                                                                             |
| `GITHUB_BUGFIX_DISPATCH_TOKEN` | Production Worker secret. A fine grained personal access token with `Actions: write` on this repository and nothing else; it expires, so renew it before the date GitHub shows. Set it with `pnpm exec wrangler secret put GITHUB_BUGFIX_DISPATCH_TOKEN --config wrangler.deploy.jsonc --env production`; `arm-bugfix-automation.sh` sets repository secrets only. While a report waits, a missing or refused token logs `Bugfix draft not dispatched` or `Bugfix draft dispatch failed` as an error in the Worker logs, and `Production Release` warns when the secret is absent | `pnpm exec wrangler secret list --config wrangler.deploy.jsonc --env production` in `apps/api` |

Set the secrets in one step:

```bash
bash scripts/arm-bugfix-automation.sh
```

Every prompt is optional, so paste only what you have, and running it again replaces the same secrets.

```bash
gh secret list
gh variable list
gh workflow view bugfix.yml
```

## Pull request review

`.github/workflows/pr-review.yml` reviews only the draft pull requests the Bugfix Draft workflow opens: author `github-actions[bot]`, head branch `bugfix/<report id>`. They open as drafts with the run token, which starts no `pull_request` workflow, so the review runs when the maintainer marks one ready for review and on each later push. Every other pull request gets no Claude review.

1. The `review` job runs with `contents: read`. Claude Code (`claude -p`, model `claude-opus-5-5`, on `CLAUDE_CODE_OAUTH_TOKEN`) reads a precomputed diff, split into 1,500-line parts so each fits one `Read` call and the task names every part, with only the `Read` and `Glob` tools available (`--tools`, so no shell and no content search; `Read` is denied `/proc`, even through a symlink, so the model cannot read its own token). The checkout is the pull request's, so the job deletes `.claude/`, `.mcp.json`, and `CLAUDE.local.md`, replaces every `CLAUDE.md` and `AGENTS.md` with the base branch's copy (their `@` imports load without the `Read` tool, so a pull request could otherwise import `/proc/self/environ`), and runs with `--setting-sources user --strict-mcp-config`: a hook or MCP server the pull request adds never runs next to the token and returns a schema-checked verdict: `approve` or `changes_requested`, findings, and whether the Conventional Commit type fits. It uploads that verdict as the `claude-review` artifact.
2. The `report` job runs no model. It checks the verdict's shape, sets a `claude-review` commit status, and keeps one review comment on the pull request up to date, with Anthropic token-shaped text redacted.

The `claude-review` status is not a required check, and the workflow never approves or merges. A bugfix pull request is armed for auto-merge only when the maintainer marks it ready for review (see [Merging pull requests](#merging-pull-requests)), and merges once the CI gate passes and, for a code-owned path, the owner approves; nothing approves it automatically.

The gate protects against the model and the diff it reads, not against a branch that edits the workflow: under `pull_request` a pull request runs its own copy of `pr-review.yml`. Only the maintainer and the bugfix bot can push branches here, and the bugfix bot's patches may not touch `.github/`, `.claude/`, `.mcp.json`, or any `CLAUDE.md` or `AGENTS.md`.

No workflow reads the `AUTO_MERGE_PRS` repository variable; check for leftovers with `gh variable list`.

## Claude Code cloud environment

Cloud sessions at claude.ai/code run in the environment configured under the session title bar's cloud environment menu, then **Edit**. Node 22 and pnpm come preinstalled.

| Setting          | Value                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network access   | **Custom**, allowed domains `cdn.sheetjs.com` (the workspaces install `xlsx` from its tarball URL), with **Also include default list of common package managers** checked                |
| Setup script     | `corepack enable`, `corepack prepare --activate`, then `pnpm install --frozen-lockfile` from the repo root, each `\|\| true` so a failed download never blocks the session from starting |
| Environment vars | None. Checks need no secrets, and a `VITE_API_URL` or `VITE_SUPABASE_*` value there overrides the test defaults and fails web tests                                                      |

The environment snapshots the setup script's result for about seven days, so the repo's `.claude/settings.json` `SessionStart` hook runs on every cloud session (`CLAUDE_CODE_REMOTE=true`) and is a no-op locally. It unshallows the clone and fetches tags, which the web release-note and content-freshness tests read, then runs `pnpm install --frozen-lockfile` to catch lockfile changes.

## Current hosted resources

The intended production endpoints are:

- Production public site: <https://zoption.site> (Pages project `zoption-site`)
- Production public site alias: <https://www.zoption.site>
- Production web app: <https://app.zoption.site> (Pages project `clarity-budget`)
- Production API: <https://api.zoption.site>

Preview endpoints are provider hostnames, recorded once in `scripts/export-deployment-env.mjs`: <https://zoption-site-preview.pages.dev> (Pages project `zoption-site-preview`), <https://clarity-budget-preview.pages.dev> (Pages project `clarity-budget-preview`), and <https://budget-expense-api-preview.dondon3109.workers.dev>.

## Cloudflare dashboard and repository sync

The API Worker's dashboard `vars` and `apps/api/wrangler.deploy.jsonc` carry the same set of names in each environment (checked 2026-09-21; both environments have since gained the three Dodo Payments variables and `MOBILE_SYNC_MINIMUM_APP_VERSION`, so each carries 29 names). A discrepancy in Cloudflare's "keep your Wrangler config in sync" prompt is not on its own evidence that the repository is behind.

The dashboard renders its own copy of each value, and Workers AI model IDs are rewritten in that rendering: `RECEIPT_VISION_MODEL` (`@cf/meta/llama-3.2-11b-vision-instruct`) displays there with an `@file:`-prefixed form that is not the stored value. Do not transcribe dashboard values into the Wrangler config; change the config and let the release workflow deploy it.

To re-verify, compare the dashboard's list of names against `apps/api/wrangler.deploy.jsonc`. The two name sets must match exactly. No value should appear as a plain `vars` entry for any name in `secretVariableNames` (`scripts/validate-deployment-config.mjs`); the validator fails a deployment if one does. `AI_ENTRY_PROVIDER_TIMEOUT_MS` is deliberately absent from both deployed environments: the code falls back to `DEFAULT_TIMEOUT_MS` (`30_000`), the same value the local config sets.

## Legacy origin cleanup

The legacy production Pages origin is no longer accepted by the API. Production `ALLOWED_ORIGINS` contains only `https://app.zoption.site`, `https://zoption.site`, and `https://www.zoption.site`. Keep only the app's custom-domain callback URL in Supabase once the cutover below is complete, and rerun the documented Production smoke command with the expected Supabase origin after deployment or routing changes.

## Subdomain cutover (one time)

The public site moves to its own Pages project and the app to `app.zoption.site` in two releases, so neither host ever serves the wrong build. Tick each step here in the change that records it.

**Release 1: the site ships beside the unchanged app.** It deploys `apps/site` to `zoption-site` (not yet on a custom domain) and adds `https://app.zoption.site` to the Worker's `ALLOWED_ORIGINS`. `zoption.site` still serves the full app build from `clarity-budget`.

1. Before approving the release: create the Pages project `zoption-site` (Direct Upload; no Git connection).
2. Approve the release, then open the `zoption-site` deployment on its `pages.dev` URL and check the landing page, a guide, the calculator, and `/install`.
3. Add the custom domain `app.zoption.site` to `clarity-budget`, and add `https://app.zoption.site/auth/callback` to the Production Supabase redirect allow-list. Keep the `zoption.site` callbacks.
4. Move `zoption.site` and `www.zoption.site` from `clarity-budget` to `zoption-site`. From here the site serves every public page and permanently redirects `/login`, `/signup`, `/auth/*`, `/app/*`, and the other app paths to `app.zoption.site` with the query string intact, where the unchanged app build still answers them.
5. Resubmit `https://zoption.site/sitemap.xml` in Search Console and Bing Webmaster Tools.

Merge release 2 next: until it ships, the production smoke gate still expects the old single-host layout on `zoption.site` and fails.

**Release 2: the app becomes app-only.** It removes the public pages from `apps/web`, sets `WEB_APP_URL` to `https://app.zoption.site`, points the Android share link at the app, and switches the smoke gate to the two-host layout.

6. Set the Production Supabase Site URL to `https://app.zoption.site`, then approve the release.
7. After it is live, remove the `zoption.site` callbacks from Supabase. The site keeps redirecting any old `/auth/*` link to the app.

PayPal and Dodo need no change: return URLs come from `WEB_APP_URL` at checkout time, and webhooks stay on `api.zoption.site`. Web users sign in once more after step 4, because a session is stored per origin.
