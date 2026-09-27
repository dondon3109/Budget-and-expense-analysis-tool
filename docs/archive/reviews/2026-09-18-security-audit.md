# Security audit, zoption, 2026-09-18

**Reviewed by**: deepseek/deepseek-v4.1-flash. Six parallel read-only audit agents with non-overlapping file ownership, synthesised and spot-verified by the parent agent.
**Independence limitation**: this runtime cannot select a reviewer model, so this is **not** an independent review. All seven agents share the same model and its blind spots. Only a read by a different provider closes that gap.
**Scope**: the whole repository at `d428182`, read-only. No file was modified, no build, migration or test was run.
**Contract read**: `AGENTS.md`, `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/architecture.md`, `docs/deployment.md`, `docs/mobile/security-and-privacy.md`.
**Verdict**: 🟠 No critical finding, and no cross-tenant or injection hole. Four High items should be fixed before the next release.

Severity key: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low.

## Summary

Four independent agents each attacked a different trust boundary and each came back empty, which is the headline. Tenant identity is derived only from the verified JWT `sub` through a strictly 1:1 `user_tenants` table; every SQL statement in the data layer binds `tenant_id`, including joins, bulk sync, compaction and the entitlement fragment; PayPal webhook signatures are verified server-side against the configured `PAYPAL_WEBHOOK_ID` and fail closed; every assistant tool is a read, so prompt injection cannot move money or cross tenants; and provider credentials are AES-256-GCM ciphertext under a Worker secret that never leaves the Worker. There is also no leaked secret in any tracked file: `.env`, `apps/api/.dev.vars` and both `.zoption-cloud-backup` files are untracked and were never committed, and the only committed credentials are Supabase publishable keys, which are public by design.

The risk that remains is concentrated at the edges of otherwise sound designs. The voice WebSocket route is mounted beside the consent-checked voice routes but never calls the consent gate, so it streams microphone audio to Google with no recorded consent, no feature flag and no per-tenant cost ceiling. The web CSP trusts whole PayPal and Venmo script wildcards on an origin whose refresh token sits in `localStorage`, and the build check that is supposed to reject unapproved wildcards is built from the same list it validates, so it can never fire. A static dev bearer token still short-circuits JWT verification entirely, gated only by substrings in two environment variables. And mobile sync gives one authenticated tenant an unmetered, never-collected write path into the single D1 database every other tenant shares.

## What was attacked and held

Recorded so these controls are not regressed, and because their strength is what keeps the verdict below Critical.

- **Cross-tenant isolation.** Tenant comes only from `sub` → `user_tenants` (`db/tenants.ts:197-208`); the table is 1:1 by schema (`user_id` PRIMARY KEY, unique `tenant_id`, `db/migrations/0004_white_eternals.sql`). No header, body, email or path id can influence it. Verified against a live Hono 4.13.5 harness that `/api/app/*` gates every mount including `/api/app/identity` and `/api/app/admin/*`, that `/api/appX/...` is not matched, and that a sub-app's `use("*")` covers its exact mount root.
- **No injectable SQL.** Dynamic identifiers come only from closed internal sets (view/table ternaries, module column constants, zod enums), values are bound, `ORDER BY` is mapped through a ternary, `IN` lists repeat literal placeholders, and `LIKE` input is escaped with `ESCAPE`. Placeholder-to-bind ordering was checked statement by statement on the interpolated-column and entitlement paths; no silent value shifting.
- **Entitlement cannot be forged.** Signature verification is a server-to-PayPal call against `PAYPAL_WEBHOOK_ID` (`billing/paypal.ts:471-490`), `webhookId()` throws 503 when unset, the cert URL is pinned to PayPal hosts, entitlement is read from a D1 view and never a request field, and plan/interval/price are server-owned.
- **Prompt injection cannot reach money.** `apps/api/src/assistant/**` contains no `INSERT`/`UPDATE`/`DELETE`, all ten tools are reads, none accepts an entity id, and every reader call takes `{ env, tenantId }` from server context.
- **Client at-rest crypto and update integrity.** SQLCipher with a hex-guarded `PRAGMA key`, key generated from `getRandomBytesAsync(32)` and stored `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`; `allowBackup: false` is re-verified at runtime by a native module. The APK updater pins package id and signer fingerprint in native code with redirects disabled and exact-host HTTPS download.
- **CSV export neutralises formula injection.** `safeText` prefixes `/^\s*[=+\-@]/`, which covers tab and CR prefixes; the archive is JSON, not zip, so zip-slip is unreachable.

## High

### 🟠 The voice WebSocket bypasses both consent gates, the feature flag, and every voice cost limit, `apps/api/src/routes/voice-stream.ts:87`

**Problem**: `createVoiceStreamRoutes` is mounted on the same prefix as the consent-checked voice routes (`app.ts:765-766`) but never calls `requireConsent`. The file contains zero references to `requireConsent`, `ASSISTANT_VOICE_ENABLED` or `CURRENT_ASSISTANT_VOICE_CONSENT_VERSION`; the gate lives in `assistant/voice-service.ts:200-220` and is only reachable through the POST routes. The route is even called with no arguments — `createVoiceStreamRoutes(_platformAdmins?)` at `voice-stream.ts:87`, invoked bare at `app.ts:766` — so it never receives the service that owns the gate. It goes straight from auth to provider config (`voice-stream.ts:99`) and streams caller PCM to Gemini Live with the platform key (`:210`, feed at `:429-453`). Cost accounting is absent too: the cycle counter and the per-tenant voice policies do not cover this path, leaving only the generic `tenant-read` bucket of 120 handshakes per minute with no session or duration cap.

**Why it matters**: a user's spoken financial details reach Google with no recorded consent, and the consent state the UI reports does not reflect it. One free tenant can also hold or rotate many platform-funded live sessions indefinitely.

**Concrete scenario**: a user registers and never opens the assistant settings. They take their JWT and open `wss://api.zoption.site/api/app/assistant/voice/stream?token=<JWT>`, then send PCM frames continuously. No preferences call is needed and the socket stays open. Their audio is transcribed by Zoption's Google project; the product has no record that they agreed to it.

**Suggested fix**: pass the assistant voice service into `createVoiceStreamRoutes` and call `requireConsent(env, tenantId)` before the upgrade, then add a concurrent-session and duration cap plus a stream cost counter.

### 🟠 Wildcard script sources in the CSP on an origin that keeps the refresh token in `localStorage`, `apps/web/deployment-config.ts:177-190`

**Problem**: `PAYPAL_CSP_SOURCES` (`:177-184`) includes `https://*.paypal.com`, `https://*.paypalobjects.com` and `https://*.venmo.com`, and all of them go into `script-src` (`:190`, emitted at `:218`). The only wildcard screen, `APPROVED_CSP_WILDCARD_SOURCES` (`:185-187`), is constructed from that same array, so the build check is circular and cannot reject the PayPal wildcards — it only catches a wildcard added elsewhere. Meanwhile `apps/web/src/lib/supabase.ts:10-16` passes `persistSession: true` with no `storage` override, so auth-js defaults to `localStorage`, where the access and refresh tokens both sit.

**Why it matters**: one compromised PayPal or Venmo subdomain — a dangling DNS record, a marketing microsite, a third-party tag — yields a script that runs with full DOM access on the app origin and can read the refresh token. That converts a third-party compromise into persistent account takeover.

**Concrete scenario**: an attacker finds a dangling `*.paypalobjects.com` record, serves JavaScript from it, and injects a script tag through a page the checkout flow already loads. The script reads `sb-<ref>-auth-token` from `localStorage` and posts it out. The refresh token gives indefinite session renewal and full read/write on the victim's workspace.

**Suggested fix**: narrow `scriptSources` to the exact hosts the PayPal SDK loads (confirm with a CSP report-only run), drop `*.venmo.com` unless Venmo is genuinely a funding source, and fix the wildcard check so the approved list is independent of the list under test. If the wildcards must stay, the session has to move out of `localStorage`.

### 🟠 Production clients send the Supabase access token in the WebSocket query string, `apps/api/src/auth.ts:94-98`

**Problem**: `apps/web/src/lib/api.ts:1147` and `apps/mobile/src/api/voice-stream.ts:105` both build `.../voice/stream?token=<JWT>`. The server accepts it for any request that merely sets `Upgrade: websocket` — there is no requirement of a real 101 upgrade or a loopback origin — and takes the token from `?token=` or the first `Sec-WebSocket-Protocol` value. The mobile source even carries a comment acknowledging the URL is sensitive (`voice-stream.ts:106`) and then logs the full URL on a dev-build failure (`:421-426`).

**Why it matters**: a full-account bearer credential enters URL-logging infrastructure at the edge, in any TLS intermediary, and in `wrangler tail` output. Browsers cannot set headers on a WebSocket handshake, but the subprotocol mechanism is already implemented server-side, so the query-string form buys nothing.

**Concrete scenario**: anyone with read access to request logs filters for `?token=` and replays the JWT against any `/api/app/*` route for the remainder of its lifetime, reading transactions and budgets with no MFA and no trace beyond normal API use.

**Suggested fix**: accept the token only from `Sec-WebSocket-Protocol`, or mint a single-use ~60-second ticket over an authenticated POST and put only that in the URL. Severity depends on whether Workers Logs or Logpush is enabled in the dashboard; with retention on, treat this as High.

### 🟠 One tenant can exhaust the shared D1 database, `apps/api/src/db/mobile-sync.ts:523`

**Problem**: every sync push writes a `mobile_sync_idempotency` row (`:523`) and nothing ever deletes that table — a repo-wide search finds only the insert, the lookup and tests, with no `DELETE`, TTL or cron. Daily compaction sweeps the change log and client rows only (`compaction.ts:37-48`, `:71-96`). Conflict results persist a full financial snapshot in `response_json` (`mobile-sync.ts:211-226`). Nothing meters the write path: `BillingFeature` covers only `assistant_question` and `file_import`, and the only entity cap is on custom categories. A second-order variant: a client row created with `acknowledged_sequence = 0` (`read.ts:39-51`) stops compaction's `HAVING MIN(...) > retention_floor_sequence` (`compaction.ts:61`) from ever firing for 90 days.

**Why it matters**: all tenants share one D1 database. Once the per-database size cap is reached, writes fail for every user — no transactions, no imports, no bootstrap for new sign-ups. Financial records stop being recorded product-wide, which is a worse outcome for users than any single-tenant breach.

**Concrete scenario**: one free account loops `POST /api/app/sync/push` with 50 create operations per call using fresh UUIDs. At 60 requests per minute that is roughly 3,000 transactions plus 3,000 change rows plus 3,000 idempotency rows per minute, sustained for days, with no quota feedback and no collection.

**Suggested fix**: add a retention sweep that deletes `mobile_sync_idempotency` rows past the documented 90-day offline window, and enforce a per-tenant write quota for transactions and events.

### 🟠 `dummy-dev-access-token` short-circuits JWT verification, gated only by environment substrings, `apps/api/src/auth.ts:102-113`

**Problem**: the middleware accepts a hard-coded bearer string before calling the verifier, requiring only `POSTHOG_AI_ENVIRONMENT !== "production"` and a `"localhost"` substring in `WEB_APP_URL` or `ALLOWED_ORIGINS`. The condition never inspects the request, so any internet client can use it whenever that configuration holds. `readiness.ts:27-49` does not prevent the enabling configuration: `validateOrigin` checks protocol, credentials, path, query and fragment but never the hostname, so `ALLOWED_ORIGINS="https://localhost-cdn.example.com"` passes the binding check and satisfies the substring test. `WEB_APP_URL` is not validated at all. The resulting identity is `DEV_USER_ID`, which `apps/api/.dev.vars:4` sets to the migration-seeded platform admin (`db/migrations/0017_platform_sponsored_pro.sql:54-55`) — in that configuration the bypass reaches every `/api/app/admin/*` route.

**Why it matters**: it is a latent authentication bypass rather than an active one. I verified the tracked `apps/api/wrangler.deploy.jsonc`: production runs `POSTHOG_AI_ENVIRONMENT: "production"` with `zoption.site` origins (`:114-135`), and preview runs `"preview"` with `*.pages.dev` origins (`:52-71`), so neither satisfies both conditions today. The defect is the shape of the guard, and it becomes a full compromise the moment someone adds a localhost-bearing origin to a deployed environment.

**Concrete scenario**: an operator adds `http://localhost:5173` to a preview `ALLOWED_ORIGINS` to debug a client. An unauthenticated attacker now sends `Authorization: Bearer dummy-dev-access-token` from anywhere, receives `DEV_USER_ID`'s session, and — if that id holds an admin grant — reads provider credentials, every user's bug reports, and sends Resend invitations to arbitrary addresses.

**Suggested fix**: require an explicit opt-in flag that defaults off, compare the request host itself against a loopback list, delete both `.includes("localhost")` checks, and have readiness reject localhost-looking hostnames outside local development.

## Medium

### 🟡 Refunds, chargebacks and disputes never revoke Pro, `apps/api/src/routes/paypal-webhooks.ts:14-22,77`

`SUBSCRIPTION_EVENT_TYPES` handles seven event types and silently ACKs the rest (`:77`); the live setup script registers the same seven (`scripts/setup-paypal-live.mjs:23-31`), so `PAYMENT.SALE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED` and `CUSTOMER.DISPUTE.CREATED` are neither delivered nor handled. Entitlement derives from subscription status plus a period end (`db/billing.ts:32-37`), never from whether money settled, and the only reconciliation selects checkouts that never completed (`:868`). A user who charges back keeps Pro for the paid period, repeatable on fresh accounts; the dispute is invisible to code and only a human reading the PayPal dashboard would catch it. **Fix**: register and handle the reversal and dispute events, writing a terminal local state for the matched subscription instead of re-reading PayPal's still-`ACTIVE` agreement.

### 🟡 Paid AI endpoints carry no entitlement gate and no per-account quota, `apps/api/src/billing/usage-limits.ts:3-11`

`BillingFeature` knows only `assistant_question` and `file_import`; STT, TTS, receipt vision and PDF entry have only per-tenant rate limits (`app.ts:553-577`) and `requirePro` appears solely on exports, account routes and cashflow analytics. A free tenant can reach roughly 200 billable provider calls per day (30 STT + 60 TTS + 60 vision + 30 voice entry + 20 PDF), and the only thing scaling with identity is a counter the attacker can mint more of by registering again. **Fix**: extend `BillingFeature` with the media features and consume a per-cycle quota or require Pro before calling the provider.

### 🟡 Interest is credited on the absolute value of a negative balance, `apps/api/src/interest/scheduled-credit.ts:148-153`

`interestAmountMinor` computes `Math.abs(balanceMinor)` (`packages/shared/src/interest.ts:47`), and no code path prevents an expense or transfer from driving a savings account below zero. A Pro user can make an account deeply negative and watch the daily cron insert positive `kind='income'` rows that compound (`:191-201`). The app fabricates income in the user's own ledger, which is the figure every balance, budget and Pro-only projection is built from. **Fix**: skip non-positive balances at the call site or return 0 from the shared function, and add the sign case to the interest tests.

### 🟡 The answer-grounding validator only checks canonically formatted amounts, `apps/api/src/assistant/answer-validation.ts:6-7`

Both money patterns require exactly two decimals (`\.\d{2}`), so `"PHP 12,345.6"`, `"12,345.6 pesos"` and bare centavos are never compared against tool output, and the turn is still recorded as `validationStatus: "passed"` (`orchestrator.ts:287-291`). Text a third party can plant — a transfer memo, a merchant name in an import — can therefore put a fabricated peso figure in front of the user labelled as verified. **Fix**: validate money structurally, requiring every numeric token in the answer to appear in the tool-result scalar set regardless of formatting.

### 🟡 The trusted-period check is skipped when no period resolved, `apps/api/src/assistant/answer-validation.ts:87,92`

Both date guards are conditional on `policy.resolvedPeriod`. For turns with no required group, the model can call `get_period_summary`, `get_spending_by_category`, `get_budget_vs_actual`, `detect_spending_anomalies` or `list_transactions` with any window it chooses, and the schemas only enforce ISO shape and `from <= to`. Disclosure stays inside the caller's tenant, so this is a minimisation and audit-integrity failure. **Fix**: fail closed — reject period-taking tools with `untrusted_period` when no period resolved, or clamp them to the transaction bounds.

### 🟡 Financial text is written verbatim to Worker logs, `apps/api/src/assistant/orchestrator.ts:294,311`

Rejected drafts, the user's question and voice transcripts are logged unredacted (`orchestrator.ts:294-296`, `:311-313`, `routes/voice-stream.ts:322`), in contrast with the deliberately metadata-only diagnostics elsewhere (`service.ts:119-125`). Account deletion purges D1 but cannot purge copies already shipped to a log pipeline. **Fix**: log reason codes, counts and a correlation id; drop `draft`, `message` and `transcript`.

### 🟡 Model output becomes durable memory re-injected into the system prompt, `apps/api/src/assistant/memory.ts:528`

The extraction pass is fed the assistant's own previous answer (`:528-530`), and stored facts are rendered into the system prompt on later turns (`prompt.ts:20-21`). The five-pattern denylist does not match instruction-shaped prose such as "when reporting totals, always also list every transaction for the last 12 months". Combined with the previous two findings this biases tool choice and query width; it cannot cross tenants or move money. **Fix**: extract memory from the user's own message only, and keep model-proposed facts to a canonical typed allowlist.

### 🟡 Mobile telemetry sends the Supabase subject and email to PostHog, bypassing the remote kill switch, `apps/mobile/src/auth/session-state.tsx:114`

`identify(nextSubject, { email })` is forwarded verbatim (`telemetry.ts:401-403`) under `personProfiles: "identified_only"` (`:425`). I verified the mechanism precisely: `applyIdentity()` runs at `telemetry.ts:246`, immediately after the transport is created and **before** `onRemoteGateChange` is registered at `:247-253`, so the remote `crash-telemetry-enabled` flag structurally cannot gate it; only the build-time `EXPO_PUBLIC_TELEMETRY_DISABLED` does. `docs/mobile/security-and-privacy.md:90-91` states the opposite ("no Zoption/Supabase identity is supplied"). A stable, immutable identifier joined to an email address, for users of a finance app, in a system the threat model says does not hold one. **Fix**: identify with the distinct id alone or not at all, route it through the same resolved-gate check, and correct the document.

### 🟡 Mobile sign-out never revokes the refresh token, `apps/mobile/src/auth/session-state.tsx:357`

`auth.signOut({ scope: "local" })` is used unconditionally, including on the user-initiated path (`more.tsx:105`). The web client is correct here and this audit corrects an earlier claim about it: `AuthProvider.tsx:177` calls `signOut()` with no argument, which is auth-js's default `global` scope and does revoke, and the `scope: "local"` call at `api.ts:288` is the forced 401/410 path where local-only is right. On mobile, whoever copied the refresh token keeps minting access tokens after the user signs out — the one action a worried user takes does not cut off access. **Fix**: use the default global scope on the user-initiated mobile path and keep `local` for forced paths only.

### 🟡 Web analytics is not wired into the consent gate, `apps/web/src/main.tsx:46`

`<PostHogAnalytics />` mounts as a plain sibling and `funnel.ts:63-69` initialises the SDK with no consent read; `registerOptionalIntegration` (`consentGate.ts:77`) has zero callers, so there is no cleanup to run on revocation. `CookiePolicyPage.tsx:83-85` promises that revocation blocks future optional activity and triggers registered cleanup. Funnel events also fire inside `/app/*`, and posthog-js attaches `$pathname`/`$host` itself, which the sanitizer does not rewrite — no amounts or query strings leave, but private route names do. **Fix**: register analytics through `registerOptionalIntegration` with `opt_out_capturing` cleanup, gate `captureFunnelEvent` on stored preferences, and extend the sanitizer.

### 🟡 The account-archive export is unbounded and ungated, `apps/api/src/db/transactions.ts:188`

The export query has no `LIMIT`; the 5,000-row cap is applied in JavaScript after the rows are materialised (`:586`). The archive route calls it with no filters and no `requirePro` (`routes/exports.ts:17`, `exports/archive.ts:53`), unlike the CSV route which does gate (`routes/exports.ts:37`), and pretty-prints the result into one body (`:33`). Any free user can loop it at 20/min, each call a full scan plus seven table dumps. On a large tenant this OOMs the isolate and, sustained, degrades the shared database and inflates the D1 bill. **Fix**: push the cap into SQL (`LIMIT 5001`, then 413) and gate the route or tighten its policy.

### 🟡 Snapshot paging re-ranks the whole change log on every page, `apps/api/src/db/mobile-sync/read.ts:80,114`

Each snapshot page runs `ROW_NUMBER() OVER (PARTITION BY ...)` across the tenant's entire retained log before the outer `LIMIT`, and the caller supplies `offset` with `limit` as low as 1. The intended full-snapshot flow is quadratic in log size, and the same cost can be forced repeatedly under the 60/min write policy — a cost and availability lever rather than a disclosure. **Fix**: page from the snapshot views with `LIMIT`/`OFFSET` over a stable key, and add the covering index on `(tenant_id, entity_type, entity_id, sequence DESC)`.

### 🟡 Live cloud keys are served by a LAN-bound dev Worker behind a fixed token, `apps/api/package.json:7`

`wrangler dev --ip 0.0.0.0 --port 8787` binds all interfaces; `scripts/local-supabase.mjs:31` rewrites only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, leaving every other `.dev.vars` value live; and the dummy token is accepted whenever the localhost conditions hold. Anyone on the same network can spend the developer's DeepSeek, Google, Fish and Cloudflare AI budget, and send mail through the live Resend key. Local D1 holds seeded data, so no customer ledgers are exposed. **Fix**: bind `127.0.0.1` by default behind an explicit LAN opt-in, and gate the dev token on a dedicated local flag.

### 🟡 The secret-in-`vars` gate does not cover the credential master key, `scripts/validate-deployment-config.mjs:25-34`

`secretVariableNames` lists eight names and the check at `:218-222` only walks that list. `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` (`apps/api/src/types.ts:55`) is absent, as are the other provider API keys. The file validated is `apps/api/wrangler.deploy.jsonc`, which is tracked in git — added deliberately by `a35344f "ci: track deploy-safe Worker configuration"`. A contributor who puts the master key in `vars` instead of `wrangler secret put` passes validation, commits it, and deploys it as a plaintext binding, putting the key that decrypts every stored provider credential into git history. **Fix**: add the key and the provider keys to `secretVariableNames`, and fail the release when the key is unset in the target environment.

## Low

- ⚪ **Avatar MIME allowlist is prototype-chain bypassable**, `apps/api/src/avatars.ts:11`. `value in avatarExtensions` accepts `"constructor"`, `"toString"` and `"__proto__"`; the client-controlled part's `Content-Type` then yields a key like `<uuid>.function Object() { [native code] }` that `parseAvatarPath` rejects, so it is an orphaned object that only account deletion sweeps. No stored XSS: `nosniff` is set on the public avatar route. Use `Object.hasOwn` and sniff magic bytes.
- ⚪ **Avatar deletion cannot revoke year-long caches**, `apps/api/src/avatars.ts:80-81`. `max-age=31536000, immutable` with UUID-based paths means a removed or account-deleted photo stays retrievable from caches for up to a year. Serve with a short `max-age` plus revalidation.
- ⚪ **The 410 tombstone is skipped on `/api/app/admin/*`**, `app.ts:438-439`. The deleted-subject check lives inside the tenant resolver, which the admin skip predicate disables, and the purge never touches `platform_admin_grants`. A retired admin's retained token keeps working for its TTL. Move the tombstone check into the auth middleware.
- ⚪ **Local-dev CORS trusts registrable hostname prefixes**, `app.ts:338-344`. `http://10.` and `http://192.168.` are prefix matches, so `http://10.attacker.example` gets its origin reflected on the preview deployment; a hostile origin still needs a token, since auth is Bearer-only. Compare exact loopback origins against an explicit local flag.
- ⚪ **Release job keeps a `contents: write` token while install scripts run**, `.github/workflows/release.yml:28-31,40`. `persist-credentials: false` is missing, unlike `ci.yml:22` and `android-beta.yml:40`, so a build-script-allowlisted dependency can read `.git/config` and push to `main`. One-line fix.
- ⚪ **The dependency audit excludes the deploy toolchain**, `.github/workflows/ci.yml:32`. `pnpm audit --prod` skips devDependencies, and `wrangler` is one, yet the release job runs it with `CLOUDFLARE_API_TOKEN`. Add a dev audit gate and keep each global GHSA ignore paired with the patch that justifies it.
- ⚪ **`.gitignore:12` lists a file that is deliberately tracked**, `apps/api/wrangler.deploy.jsonc`. Commit `a35344f` added it on purpose and it holds no secret — only Supabase publishable/anon keys, D1 ids and PayPal plan ids — but `docs/deployment.md:194` still calls it "the ignored" file. The stale rule and the stale sentence make it exactly where a real secret gets committed later. Delete the ignore line and record the publishable-only rule in the doc.
- ⚪ **Documented invariants contradict the code in two places.** `docs/architecture.md:11` claims no provider credentials are stored in D1 while `db/migrations/0047_provider_credentials.sql:5` stores `encrypted_secret` (correct `docs/deployment.md:155` says the opposite), and `apps/api/AGENTS.md:52` states a backfill must bump `revision` while `db/migrations/0045_category_emoji_sync_bump.sql:15` bumps it in a way that suppresses the only categories change trigger (`0042:151-157` fires when `NEW.revision = OLD.revision`), so the backfill emits no sync change and mobile clients never receive it.
- ⚪ **No key rotation and no ciphertext binding for provider credentials**, `apps/api/src/provider-credentials/crypto.ts:45-75`. `iv || ciphertext` with no key version or AAD means `docs/deployment.md:162` correctly states that rotation makes stored credentials permanently undecryptable, so the incident response for the highest-value secret is "lose all provider access". Add a one-byte key version and `additionalData`, then a two-key decrypt window.
- ⚪ **The public Supabase avatars bucket has no SELECT policy**, `supabase/migrations/20260726062313_create_avatar_storage.sql:4`. With `public = true` the object URL bypasses RLS, so the bucket doubles as anonymous image hosting on the project domain and any avatar is world-readable to whoever holds the link. Largely intended, but record the decision and consider `public = false` with serving through the Worker route.
- ⚪ **Provider keys travel in URL query strings**, `apps/api/src/assistant/google-stt.ts:115,192,242`, `routes/voice-stream.ts:210`. The destination host is hard-coded so this is not SSRF, and `docs/voice-live.md:20` records the choice as accepted, but a long-lived credential in a URL is one log line away from exposure. Send it in `x-goog-api-key` and redact query strings before logging error text.
- ⚪ **The in-app mic widget activity is exported with no permission or caller validation**, `apps/mobile/plugins/with-android-mic-widget.js:86`. `MicWidgetVoiceActivity` is declared `android:exported="true"` with no intent filter, so any installed app can start it by explicit component name and pop Zoption's speech prompt over whatever the user is doing. No data returns to the caller, so this is unnecessary attack surface and a phishing-shaped nuisance rather than a leak. The widget's own `PendingIntent` is same-UID and keeps working with `exported="false"`.
- ⚪ **Dev builds log the token-bearing voice WebSocket URL**, `apps/mobile/src/api/voice-stream.ts:419-427`. The failure path logs the full URL including the credential, gated to localhost dev builds. Developer tokens rather than user tokens, but it is the pattern a future refactor copies into production diagnostics. Log the endpoint without the query.

## Corrections made during synthesis

Verification changed three findings, which is recorded so the report is not read as a straight aggregation.

1. **Web sign-out is not a finding.** An earlier lane reported both clients as local-only. The web user-initiated path (`AuthProvider.tsx:177`) uses auth-js's default `global` scope and does revoke the refresh token; only the mobile path is unconditionally `local`.
2. **The dev-token bypass is latent, not live.** I read the tracked deployment config directly: production and preview both fail its two conditions. The original High rating stands only as a description of blast radius if the configuration changes.
3. **Telemetry identity bypasses the remote kill switch structurally**, not incidentally: `applyIdentity()` fires before the gate callback is registered.

An earlier signal was also withdrawn: `billing_webhook_events` appeared to be a tenant table missing from the deletion purge, but the live table (recreated in `0020_paypal_only_billing.sql:80`) has no `tenant_id` at all. The obsolete Paddle-era definition from `0013` had been matched by mistake.

## Open questions

- **D1 `PRAGMA foreign_keys` default.** Ten tenant tables rely on `ON DELETE cascade` rather than the explicit purge list: `receipt_preferences`, `transfer_groups`, `mobile_sync_state`, `mobile_sync_changes`, `mobile_sync_change_groups`, `mobile_sync_clients`, `mobile_sync_idempotency`, `assistant_memories`, `assistant_model_memory_pass_usage` and `subscription_renewal_notifications`. `apps/api/tests/helpers/d1-test-harness.ts:178` must enable the pragma explicitly on `node:sqlite`, so the tests prove cascade behaviour only under enforcement and nothing in the repo asserts it for production. Web search was unavailable during this audit (the search endpoint returned HTTP 402), so the platform default was not confirmed. **This is the single assumption most worth settling**: if cascades do not fire, a deleted account retains sync payload snapshots, assistant memories and consent records while the API reports a clean deletion. Adding the ten tables to the batch is cheap and makes the comment true either way.
- **Cloudflare Workers Logs / Logpush retention.** Not configured in `wrangler.jsonc`, and it decides whether the token-in-URL issue is a hygiene problem or an active credential leak, and whether the unredacted log lines matter.
- **Whether the PayPal SDK genuinely needs the script wildcards.** This decides whether the CSP fix is one line or an architectural change to session storage.
- **Supabase dashboard state**: whether "Confirm email" is required (sponsored-seat invitations treat `email_confirmed_at` as proof of mailbox ownership), the hosted bucket flags, and whether the anon key's grants and RLS are as intended. The repo holds local-dev config only.
- **Branch protection, required reviews, and environment approval** on the production deploy job are invisible from the repository. If any collaborator can push to `main`, they inherit the Cloudflare token, D1 migrations and `contents: write`. There is no `CODEOWNERS` and no dependency-update bot.
- **`.dev.vars` contents were not read** (gitignored, live keys). The LAN-exposure blast radius is inferred from `.dev.vars.example:16-46`.
- **`import_previews.rows_json` retention.** Cleaned lazily on preview and on commit, with no cron sweeping abandoned previews, so parsed statement text may outlive the advertised 15-minute TTL.
