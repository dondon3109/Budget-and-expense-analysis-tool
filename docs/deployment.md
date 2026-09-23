# Cloudflare and Supabase deployment runbook

Zoption deploys as a Cloudflare Pages app at <https://zoption.site> plus a Worker at <https://api.zoption.site> with a D1 binding. Supabase Auth supplies user identity and sessions; private financial data remains in D1 and is partitioned by the tenant resolved from a verified Supabase JWT. The repository contains the public production domains but deliberately contains no account IDs, private tokens, or service-role keys.

## One-time Supabase setup

1. Create separate Supabase projects for Preview and Production. Deployment validation fails closed when environments reuse a normalized Supabase origin or publishable key, preventing Preview authentication traffic from reaching Production and vice versa.
2. In each project's **Authentication > URL configuration**, keep environments isolated:
   - Preview: set the site URL to `https://PREVIEW_WEB_HOST` and allow only `http://localhost:5173/auth/callback` (when this project is used locally) plus `https://PREVIEW_WEB_HOST/auth/callback`.
   - Production: set the site URL to `https://zoption.site` and allow only `https://zoption.site/auth/callback` plus `https://www.zoption.site/auth/callback` while the alias is served.
3. Keep email/password enabled. Configure confirmation email delivery and templates before inviting users. The Site URL is only a fallback; password recovery should return through `/auth/callback?next=%2Fupdate-password`. In the recovery email template, link the reset action to `{{ .ConfirmationURL }}` so Supabase preserves the `redirectTo` supplied by the app. Do not link recovery mail directly to `{{ .SiteURL }}`. Compare the reset request's actual `redirectTo` with the dashboard allow-list and add the query-bearing production callback explicitly if Supabase does not accept the base callback entry. New Free-plan projects using Supabase's default SMTP cannot customize Auth templates, so configure custom SMTP when template editing or delivery to non-team addresses is required.

   Both hosted projects run custom SMTP through Resend, configured identically. These are the live values, read back from the project rather than assumed:

   - Host `smtp.resend.com`, port `465`, user `resend`, password set to a Resend API key that has sending access for `zoption.site`.
   - Sender address `auth@zoption.site` with sender name `Zoption`.
   - Recovery, confirmation, email change, invite, and magic link templates link to `{{ .ConfirmationURL }}`. Reauthentication uses the raw `{{ .Token }}`, which is correct for a code rather than a link.
   - The redirect allow list carries `https://zoption.site/auth/callback`, `https://www.zoption.site/auth/callback`, the Preview Pages callback, the local callback, and the `zoption://`, `zoption-dev://`, and `zoption-preview://` mobile schemes.
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

4. Copy `apps/api/wrangler.deploy.example.jsonc` to the tracked `apps/api/wrangler.deploy.jsonc`. That file is committed on purpose and may hold only publishable values — Supabase publishable or anon keys, D1 ids, R2 bucket names, queue names, PayPal plan ids and non-secret flags. Every credential goes through `wrangler secret put`, never into this file.
5. Replace each environment's D1 ID, allowed origins, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`. Keep `SUPABASE_JWT_AUDIENCE` as `authenticated` unless the Supabase project is intentionally configured otherwise. The publishable key is public configuration, but secret and service-role key types remain forbidden in Wrangler `vars`.
6. Validate the real config before any migration or deploy. The validator reports only environment and binding names; it never prints configured values:

   ```bash
   node scripts/validate-deployment-config.mjs
   ```

   It checks Preview and Production D1 bindings, RATE_LIMIT Durable Object, AVATARS R2, and JOBS queue bindings, exact HTTPS web/Supabase origins, production routing, publishable-key type, distinct Supabase origins, keys, R2 buckets, and queues across environments, PayPal namespace and distinct monthly/annual plan variables, optional PostHog enable/environment values and the exact approved US Cloud origin, placeholders, and forbidden secret values in `vars`. Production PayPal must use `production`; Preview and Staging may intentionally use either `sandbox` or `production`. It also validates Staging when an `env.staging` block exists.

7. Create separate preview and production Pages projects. Attach `zoption.site` and `www.zoption.site` to the production Pages project in the Cloudflare dashboard. Pages custom domains are dashboard-managed; this repository does not use an `apps/web/wrangler.jsonc` file.
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

12. Before enabling sponsored-seat invitations or bug-report notifications, onboard the sender domain in Resend and store the `RESEND_API_KEY` as a Worker secret in each deployment environment. Set `WEB_APP_URL` to the exact HTTPS Pages origin, `EMAIL_FROM` to the verified sender address, and `BUG_REPORT_TO` to the private support inbox; none belongs in browser `VITE_*` configuration. This works on the Cloudflare Free plan because delivery goes through the Resend REST API (no `send_email` binding). Send a controlled invitation and bug report to addresses you manage before enabling production use.

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

The client build derives the Pages CSP from the validated API and Supabase origins, writes those exact origins into `connect-src`, writes the exact Supabase origin into `img-src`, always includes the exact R2 Android download origin `https://downloads.zoption.site` in `connect-src` (the install page fetches `android/latest.json` from it), and rejects every wildcard source. Production Pages builds require `VITE_POSTHOG_KEY`; Preview and local builds may omit it. Store the browser-visible project token as the GitHub Actions secret `VITE_POSTHOG_KEY` by running `gh secret set VITE_POSTHOG_KEY` and entering the token at the prompt. Only the exact `VITE_POSTHOG_HOST` origin (currently `https://us.i.posthog.com`) is added to `connect-src`. PostHog Web Analytics operates in cookieless, memory-only mode without setting cookies or creating person profiles, Cookieless `$pageview` capture stays limited to public routes; six anonymous funnel events (`signup_viewed`, `signup_submitted`, `app_session_started`, `first_import_committed`, `assistant_consent_granted`, `assistant_first_question`) also fire from the signup and signed-in surfaces, carrying fixed enum values only, no financial or identity detail, and nothing written to the device. Server-side PostHog AI Observability runs only in the Worker, so it adds no browser environment variable, script, request, cookie, or Pages CSP origin. Prerender verifies that the final `_headers` contains exactly the generated policy before deployment, and the production smoke check requires the PostHog origin. Production client and SSR source maps are explicitly disabled, and a successful build must leave no `.map` files in `apps/web/dist`. The pre-render theme setup loads from same-origin `/theme-bootstrap.js`; do not reintroduce an inline script or weaken `script-src 'self'`.

Set `ZOPTION_DEPLOY_ENV` explicitly in every Pages build: `production` for the production project and `preview` or `staging` for non-production projects. Preview/staging builds keep the public content and production canonicals for realistic review, but force HTML and HTTP `noindex,nofollow`, do not publish `sitemap.xml`, and do not advertise a sitemap in `robots.txt`. Production intentionally allows crawlers to fetch private routes rather than disallowing them in `robots.txt`, so crawlers can observe their HTML and `X-Robots-Tag` noindex directives. Vite embeds public environment variables in the generated assets, so changing `VITE_API_URL` or another `VITE_*` value requires a fresh build before deploying; re-uploading an existing `dist` directory does not update it.

```bash
VITE_API_URL=https://PREVIEW_API_HOST \
VITE_SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PREVIEW_PUBLISHABLE_KEY \
VITE_POSTHOG_KEY=phc_PREVIEW_KEY \
ZOPTION_DEPLOY_ENV=preview \
pnpm --filter @zoption/web build
```

The publishable key is intended for browser use. It does not grant access to D1; the Worker still verifies every access token and chooses tenant scope server-side.

Public canonical URLs do not use trailing slashes. The three legal trailing-slash variants permanently redirect to their canonical path. Public pages accept only standard UTM and ad-click identifiers (`utm_*`, `gclid`, `dclid`, `fbclid`, `msclkid`) as indexable query strings; their canonical remains query-free. Any other query parameter and any authentication/error URL state is noindex. Update a public route's manually maintained sitemap `lastModified` value only when its user-visible content changes materially; the same value feeds legal-page structured-data `dateModified`.

## Automated production release

CI validates every pull request and push to `main` in three parallel jobs: `static` (dependency audit, lint, format, typecheck), `unit` (Vitest and mobile Jest), and `e2e` (shared, API, preview and production web builds, Playwright, then Lighthouse against the production build). The `Production Release` workflow is the only normal production deployment authority: it runs from the successful `CI` workflow result for a push to `main` and decides in two jobs. The ungated `preflight` job fails at its `Verify release source` guard when `main` has already moved past the CI commit, and otherwise asks semantic-release whether the unreleased Conventional Commits require a release. A superseded result therefore fails before the `production` environment gate is reached and never requests an approval, while a non-releasing change ends in `preflight` without starting the deploy job. Only a current result that owes a release starts `deploy-and-release`, which runs in the `production` environment, requires a reviewer, and performs the migration, Worker and Pages deploys, and publication once a human approves. No approval is ever requested for a run that could only do nothing.

For a release-producing commit, the workflow uses one version and commit SHA throughout this sequence:

1. Validate the tracked production Wrangler configuration and perform a Worker dry run.
2. Create or resume a GitHub production deployment record for duplicate protection.
3. Apply pending production D1 migrations. Wrangler captures the documented backup automatically in non-interactive CI.
4. Deploy the production Worker, tagged with the selected semantic version.
5. Build Pages with that same version, deploy the output with the exact Git SHA, wait until the custom domain serves its versioned deployment marker, and run the non-mutating production smoke gate.
6. Mark the GitHub deployment successful, then let semantic-release create the matching `v*` tag and GitHub Release.

If semantic-release publication fails after a successful Cloudflare deployment, rerunning the failed workflow while that commit is still `main` reuses the successful GitHub deployment record and does not deploy Worker or Pages again. Semantic-release is also idempotent once the tag exists.

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
3. Add the GitHub Actions secret `CLOUDFLARE_API_TOKEN` with only the account permissions needed for Workers Scripts, Pages, and D1 production deployment. Existing Worker runtime secrets stay in Cloudflare and are neither copied to nor exposed by GitHub Actions.
4. Add the GitHub Actions variable `CLOUDFLARE_ACCOUNT_ID`.
5. After completing steps 1-4, add `CLOUDFLARE_PRODUCTION_GIT_DEPLOY_DISABLED=true`. The workflow refuses to deploy without this explicit operator acknowledgement.
6. Allow the workflow's `GITHUB_TOKEN` to write contents and deployments, and keep `main` protected. The rules are external state, so read them back rather than trusting this list:

   ```bash
   gh api repos/dondon3109/Budget-and-expense-analysis-tool/rulesets \
     --jq '.[] | {id, name, enforcement, bypass_actors}'
   ```

   - **main integrity - no rewrite, no delete** (`23728450`): refuses deletion and non-fast-forward pushes on `refs/heads/main`, with no bypass actors.
   - **main review gate - PR required** (`23728455`): requires a pull request for `refs/heads/main` with one approving review. The maintainer's user (`dondon3109`) is its only bypass actor, in `always` mode, so a direct push from that account is permitted and logged as a bypass, while a pull request needs an approval its own author cannot give.

   The bypass and the count of one are deliberate. On 2026-09-21, with no bypass and `required_approving_review_count` 0, reopening PR #22 — the `zoption-bug-automation` app's own proof that it could not merge itself — reported `mergeable MERGEABLE` and no review decision, so `require_extra_approval_for_unattributed_changes` alone does not keep an app-authored pull request behind a human. One required approval plus the maintainer bypass is what does.

   Classic branch protection on `main` is enabled as well, with force pushes and deletions disabled and `enforce_admins` on. Neither it nor the rulesets require a passing status check before merge: `Production Release` refuses a red `main` push instead, because it only runs from a successful `CI` result. Requiring the `static`, `unit`, and `e2e` checks is the next tightening if the merge button itself should block.

7. Require a reviewer on the `production` environment. It is what keeps a push to `main` — from any identity, including the maintainer's own bypass — from reaching production without a human click. It is external state, so read it back:

   ```bash
   gh api repos/dondon3109/Budget-and-expense-analysis-tool/environments \
     --jq '.environments[] | {name, protection_rules}'
   ```

   Leave "Prevent self-review" off. The maintainer is the only human and is the actor on his own merges, so enabling it would leave every production deployment unapprovable.

The Pages build derives its public Supabase URL and publishable key from the existing tracked production Wrangler configuration. Do not add service-role keys, provider API keys, or other Worker runtime secrets to GitHub.

## Preview release

Create a D1 Time Travel recovery point before applying migrations that remove retired data, then apply migrations and deploy the Worker. The tracked Preview environment overrides the root cron list to omit daily interest crediting: Preview keeps billing reconciliation and daily maintenance, while Production retains all three schedules. This also keeps the current Cloudflare account within its account-wide Cron Trigger quota.

```bash
node scripts/validate-deployment-config.mjs
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
VITE_POSTHOG_KEY=phc_PREVIEW_KEY \
ZOPTION_DEPLOY_ENV=preview \
pnpm --filter @zoption/web build
pnpm --dir apps/api exec wrangler pages deploy ../web/dist --project-name=PREVIEW_PAGES_PROJECT --branch=main
```

Run the non-mutating smoke gate:

```bash
EXPECT_SEARCH_INDEXING=0 \
WEB_URL=https://PREVIEW_WEB_HOST \
API_URL=https://PREVIEW_API_HOST \
EXPECTED_SUPABASE_URL=https://PREVIEW_PROJECT_REF.supabase.co \
FORBIDDEN_SUPABASE_ORIGINS=https://PRODUCTION_PROJECT_REF.supabase.co \
pnpm smoke:production
```

`EXPECTED_SUPABASE_URL` is required. Set `FORBIDDEN_SUPABASE_ORIGINS` to the other deployment's distinct Supabase origin and add any custom-domain origins that must be absent. The smoke gate rejects every CSP wildcard source and, for managed `*.supabase.co` projects, rejects every managed Supabase origin other than the expected one. It also confirms the frontend bundle embeds the expected API and Supabase origins and none of the explicitly forbidden origins.

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

After Preview and authenticated checks pass, merge a release-producing Conventional Commit into protected `main`. The successful push `CI` run starts `Production Release`: its ungated `preflight` job fails at `Verify release source` when `main` has moved on, and otherwise proceeds only when semantic-release finds a release owed, so a superseded or non-releasing commit never reaches `production` environment approval. Only when both hold does `deploy-and-release` run, and it waits for that approval before it migrates, deploys, or publishes. Operators approve and monitor the workflow rather than run Wrangler locally. The production Wrangler environment declares `api.zoption.site` as its custom domain and allows `zoption.site` and `www.zoption.site`.

The following commands are emergency recovery references only. Disable or wait for the Actions deployment before running them; never use them concurrently with `Production Release` or while Cloudflare's old Git deployment is enabled.

```bash
node scripts/validate-deployment-config.mjs
cd apps/api
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.deploy.jsonc --env production
pnpm exec wrangler deploy --config wrangler.deploy.jsonc --env production
cd ../..
```

For an emergency Pages recovery, build and deploy the frontend with production Supabase values. `VITE_API_URL` defaults to `https://api.zoption.site`. Set `ZOPTION_DEPLOY_ENV=production`; the web build rejects Cloudflare Pages builds without this explicit environment value so a preview project cannot accidentally publish indexable pages.

```bash
VITE_SUPABASE_URL=https://PRODUCTION_PROJECT_REF.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=PRODUCTION_PUBLISHABLE_KEY \
VITE_POSTHOG_KEY=phc_APPROVED_POSTHOG_KEY \
ZOPTION_DEPLOY_ENV=production \
pnpm --filter @zoption/web build
pnpm --dir apps/api exec wrangler pages deploy ../web/dist --project-name=PRODUCTION_PAGES_PROJECT --branch=main
WEB_URL=https://zoption.site \
API_URL=https://api.zoption.site \
EXPECTED_SUPABASE_URL=https://PRODUCTION_PROJECT_REF.supabase.co \
FORBIDDEN_SUPABASE_ORIGINS=https://PREVIEW_PROJECT_REF.supabase.co \
EXPECTED_POSTHOG_HOST=https://us.i.posthog.com \
pnpm smoke:production
```

Verify both production web origins appear in `ALLOWED_ORIGINS` and Supabase's redirect allow-list before inviting users. The deployed output pre-renders `/`, `/terms-of-service`, `/privacy-policy`, and `/cookie-policy`; it also publishes `/sitemap.xml`, `/robots.txt`, `/llms.txt`, and a branded `404.html`. The committed `_redirects` file routes only authentication and private application paths to the `spa.html` shell, sends legacy application paths through permanent redirects, and leaves unknown public paths as HTTP 404 responses. PostHog Web Analytics operates in cookieless, memory-only mode without setting cookies or creating person profiles, `$pageview` capture still tracks only public route transitions; the six anonymous funnel events also fire from the signup and signed-in surfaces with fixed enum values and no financial or identity detail. Verify that private application routes (`/app/*`) send only those funnel events, and confirm that the Cloudflare Web Analytics beacon and GA4 scripts are completely removed. The retired `/demo` route should return HTTP 404.

The normal workflow publishes semantic release metadata automatically only after both Cloudflare deployments and smoke verification succeed. Do not create a release tag manually after automation is enabled.

## Rollback

- **Pages:** promote the previously verified frontend deployment.
- **Worker:** roll back to the previous Worker version, but do not roll code back past an incompatible D1 migration.
- **D1:** migrations are forward-only. Create a Time Travel restore point before destructive schema changes and rehearse recovery in preview. Because migrations run before the Worker deploy, every migration must stay compatible with the previously deployed Worker; `apps/api/AGENTS.md` states the expand-then-contract rule.
- **Supabase Auth:** do not rotate or remove signing keys as an application rollback mechanism. Follow Supabase key-rotation guidance and keep old keys valid through their transition window.
- After rollback, rerun the documented environment-specific smoke command with `EXPECTED_SUPABASE_URL` (and any distinct `FORBIDDEN_SUPABASE_ORIGINS`) and verify unauthenticated `/api/app/*` requests still return `401`.

## Custom-domain verification

Before treating the domain migration as complete:

1. In the Pages project, confirm `zoption.site` serves the frontend and no Worker route or Worker Custom Domain claims the apex host. If `https://zoption.site/health` returns the API health response, the apex is still routed to the Worker.
2. Deploy the production Worker with `apps/api/wrangler.deploy.jsonc` so its Custom Domain is `api.zoption.site`, then confirm `https://api.zoption.site/health` returns `200`.
3. Add `www.zoption.site` to Pages and configure the canonical redirect, or remove the alias from `ALLOWED_ORIGINS` and Supabase if it will not be served.
4. Run the Production smoke command above, including `EXPECTED_SUPABASE_URL`, after DNS and custom-domain changes have propagated.

## Search visibility verification

After the apex redirect, public metadata, and production smoke checks pass:

1. Verify `https://zoption.site` as the canonical Google Search Console property and verify the same canonical host in Bing Webmaster Tools.
2. Submit `https://zoption.site/sitemap.xml` to both services.
3. Run the [Schema.org Markup Validator](https://validator.schema.org/) for `/` and each legal page. Confirm every public response has one linked graph using `https://zoption.site` canonical IDs: `WebApplication` on the homepage and `WebPage` on legal pages.
4. Run Google's [Rich Results Test](https://search.google.com/test/rich-results) as a diagnostic, but do not fabricate offers, pricing, reviews, or ratings to seek eligibility. Zoption intentionally publishes no organization/person, breadcrumb, FAQ, local-business, search-action, or bank-affiliation markup until corresponding visible, verified content exists.
5. Inspect the rendered HTML and Search Console URL Inspection result for `/` and each legal page. Confirm the canonical points to `https://zoption.site`, Open Graph tags reference the social image, the structured-data graph is present, and the page is indexable.
6. Confirm `/login`, `/auth/callback`, and `/app/*` return `X-Robots-Tag: noindex, nofollow`, do not emit managed JSON-LD, and do not enter the sitemap.
7. Recheck the Coverage, Core Web Vitals, and Performance reports after new or materially updated public content is released.

## Outbound bug report egress automation

The endpoint `GET /api/ops/bug-reports` is the only path the outbound automation may call.

- Outbound automation must authenticate using the `OPS_EGRESS_TOKEN` binding as a Bearer token in the `Authorization` header. It must be set as a **secret** in each Worker environment (`wrangler secret put OPS_EGRESS_TOKEN`), never a plain `vars` value.
- The admin bug-report route (`/api/app/admin/bug-reports`) returns raw content and reporter email and is off limits to this flow.
- The list mode returns only reports with no `bug_report_egress_audit` row, so a caller keeps no record of what it handled and a retry is safe. `?id=<reportId>` re-reads one report that already crossed, running the same redaction again.
- **Reading a report claims it.** The list writes an audit row for every report it returns, which is what makes it exactly once, so a caller must handle everything it receives and there is no way to look at the queue without consuming it.
- `?limit=<1..100>` caps how many reports one poll claims. It is the caller's throttle: whatever it does not ask for stays unclaimed for the next poll. The default is 100.

### The chain

1. n8n on HomeCore runs `Zoption Bugfix Draft Dispatch` every 15 minutes. It calls the endpoint with `?limit=1` and dispatches `.github/workflows/bugfix.yml` once per unhandled clean report. The limit bounds the fan out: one report per poll is one workflow run, each of which runs a coding agent, so raise it deliberately rather than by default.
2. The `draft` job runs with `permissions: contents: read`. It fetches that report by id, runs `dsh --profile headless`, checks its own output with `scripts/bugfix-scrub.mjs`, and uploads `fix.patch`, `pr-body.md`, and `meta.json` as the `bugfix-draft` artifact.
3. The `open-pr` job applies the patch to `bugfix/<report id>` and opens a draft pull request, then starts `ci.yml` explicitly: a pull request opened with the run token does not trigger `pull_request` workflows, and `workflow_dispatch` is the documented exception.
4. A human reviews and merges. The release pipeline takes over.

The drafting job is the only job that reads user text, and it holds no write token. The `open-pr` job holds the write token, runs no model, and reads no user text. Nothing outside a runner holds a credential that can write code, which is why the earlier fork, organization, and GitHub App are no longer needed.

`bugfix.yml` must exist on `main` before a dispatch can start it, or the GitHub API returns 404.

### External state this depends on

Read every one of these back after a change. None of them live in the repository.

| Setting                  | Where it lives                                                                                                         | Read it back                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `OPS_EGRESS_TOKEN`       | Worker secret, plus a repository secret the draft job reads                                                            | `pnpm exec wrangler secret list` in `apps/api`; `gh secret list` |
| `DEEPSEEK_API_KEY`       | Repository secret, read by `dsh` in the draft job                                                                      | `gh secret list`                                                 |
| `OPEN_BUGFIX_PRS`        | Repository variable, set to `true` (draft pull requests open). Unset is shadow mode, where the draft stays an artifact | `gh variable list`                                               |
| `OPS_API_BASE_URL`       | Optional repository variable, defaults to `https://api.zoption.site`                                                   | `gh variable list`                                               |
| `Zoption ops egress`     | n8n credential (Bearer), must equal the Worker's `OPS_EGRESS_TOKEN`                                                    | n8n UI on HomeCore                                               |
| `GitHub bugfix dispatch` | n8n credential (Bearer). A fine grained PAT with `Actions: write` on this repository and nothing else                  | n8n UI on HomeCore                                               |

Arm all of it in one step:

```bash
bash scripts/arm-bugfix-automation.sh
```

From this repository it writes the two n8n credentials over SSH and sets the repository secrets with `gh`. On the homeserver it writes the credentials alone. Every prompt is optional, so paste only what you have, and running it again updates the same two credentials by id. The two empty `Zoption Bug Report Triage` shells can only be deleted from the n8n UI or with an n8n API key: n8n has no delete command, and this instance holds no API key.

```bash
gh secret list
gh variable list
ssh homecore 'docker exec n8n n8n list:workflow | grep -i dispatch'
```

## Current hosted resources

The intended production endpoints are:

- Production web: <https://zoption.site>
- Production web alias: <https://www.zoption.site>
- Production API: <https://api.zoption.site>

Preview endpoints are deployment-specific. Supply them through `PREVIEW_WEB_HOST` and `PREVIEW_API_HOST` in release commands instead of committing provider-generated hostnames.

## Legacy origin cleanup

The legacy production Pages origin is no longer accepted by the API. Production `ALLOWED_ORIGINS` contains only `https://zoption.site` and `https://www.zoption.site`. Keep only the matching custom-domain callback URLs in Supabase, and rerun the documented Production smoke command with the expected Supabase origin after deployment or routing changes.
