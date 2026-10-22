# Zoption Analytics & Observability Architecture

## 1. Executive Summary

Zoption consolidates its analytics and observability infrastructure into a single platform: **PostHog**.

Legacy third-party tracking mechanisms—specifically **Google Analytics 4** and the **Cloudflare Web Analytics** client beacon (`beacon.min.js`)—have been completely removed from the frontend application, dependencies, Content Security Policy (CSP), and documentation.

PostHog serves three distinct, privacy-isolated telemetry channels:

1. **Public site pageviews, web app funnel and feature-usage events, Core Web Vitals, and web app error reports** (Client-side, memory-only; `$exception` in Error Tracking, sanitized like mobile)
2. **AI Observability** (Server-side Worker metadata, `$ai_generation`)
3. **Android crash telemetry and product events** (Client-side mobile, sanitized `$exception` in Error Tracking plus named feature events)

All telemetry is strictly bounded to protect financial privacy and operate within PostHog's generous Free Tier. The one personal data it carries is the signed-in account's identity (section 2.0), so the web and mobile app events read per account in PostHog's Persons view.

---

## 2. Privacy Boundaries & Gating

### 2.0 Account identity

- **Who is identified**: a signed-in account, on the web app (after Analytics consent) and on mobile (behind the `crash-telemetry-enabled` kill switch). The distinct id is the Supabase user id and the person property `email` is the account email. Nothing else is set on the person; default person properties stay off on mobile.
- **Web** (`apps/web/src/analytics/PostHogAnalytics.tsx`): `AnalyticsIdentitySync` in `App.tsx` passes the auth user to `setAnalyticsAccount`, which calls `posthog.identify(id, { email })` once per account while consent holds, and `posthog.reset()` on sign-out or consent revocation. Events captured before sign-in in the same page load (the signup funnel) merge into the person through `$anon_distinct_id`.
- **Mobile** (`apps/mobile/src/telemetry/account-link.ts`): `applySubject` in `session-state.tsx` hands the account to `setSignedInAccount`, which identifies it only when that account chose "granted" on this device (SecureStore key `zoption.analytics.account-link.<user id>`). With no stored choice, `UsageAnalyticsPromptHost` (`src/features/usage-analytics/`, mounted in the authenticated gate) asks once with Allow or Not now, the counterpart of the web's Analytics consent; Preferences has the same switch as **Usage analytics**. Not now, or turning it off, calls `reset()` and events stay on the per-launch device id. `telemetry.identify` holds the identity until the kill switch opens and sends it before the events queued at launch. Sign-out calls `reset()`. Guests and the dev dummy session are never identified.
- **Never identified**: the public site (`zoption.site`, cookieless, `person_profiles: "never"`) and server-side AI observability (`$process_person_profile: false`).
- **Deletion**: deleting a Zoption account does not delete its PostHog person. A deletion request to support is handled by deleting the person (and its events) in PostHog under **Persons**, as the Privacy Policy promises; otherwise the project's 12-month retention applies.

### 2.1 Public vs. Authenticated Web Surfaces

- **Consent first**: nothing is captured until the visitor grants the Analytics cookie category. Without that stored decision, or without a configured key, every capture is a silent no-op. The decision is one first-party cookie (`zoption-cookie-consent`) scoped to `zoption.site`, so a visitor who decided on the public site arrives at `app.zoption.site/signup` already decided and `signup_viewed`/`signup_submitted` are captured without a second banner. The site's `/ingest` proxy strips that cookie like any other before forwarding.
- **Pageviews on the public site only**: `zoption.site` (`apps/site/src/client/analytics.ts`) sends one `$pageview` per page load, only on `zoption.site` or `www.zoption.site` (never on a `*.pages.dev` deployment URL, `isProductionHost`), only on a built manifest page (not the 404), and never when the query carries anything but campaign parameters or the fragment carries auth state (`isTrackableUrl` in `apps/site/src/lib/trackableUrl.ts`). The module itself downloads only after consent. When an AI answer engine sent the visit (ChatGPT, Perplexity, Claude, Gemini, Copilot, DeepSeek, Meta AI, You.com), the pageview carries `ai_referrer` with the engine's name and nothing else from the referrer.
- **Same-origin ingestion on the site**: the site posts to its own `/ingest` Pages Function (`apps/site/functions/ingest/[[path]].ts`), which forwards only PostHog capture endpoints to `us.i.posthog.com` and strips cookies and client address headers, so the site CSP keeps `connect-src 'self'` for analytics and blocklists aimed at the PostHog host do not drop consented events.
- **A closed event set in the app**: the app at `app.zoption.site` sends no `$pageview` and no URL beyond the origin-and-path `$current_url` the SDK attaches. Its signup page and signed-in app send only the events typed in `apps/web/src/analytics/funnel.ts`, every property a fixed enum, plus SDK web vitals, scrubbed `$exception`s, and dashboard-only `$$heatmap` points (section 2.2):
  - Funnel: `signup_viewed`, `signup_submitted {method: password|google, outcome}`, `app_session_started`, `first_import_committed`, `assistant_consent_granted`, `assistant_first_question {surface}`. `app_session_started`, `first_import_committed`, and `assistant_first_question` fire at most once per page load. A Google sign-up is sent as `outcome: redirect_started` before the redirect (with `send_instantly`, so leaving the page cannot drop it); whether it finished shows as the next `app_session_started`.
  - Page use: `page_viewed {page}` once per signed-in path change (`apps/web/src/analytics/AppPageViewed.tsx`), naming the page from a fixed map. Admin pages and query strings are never sent.
  - Feature adoption: `voice_entry_drafted`, `receipt_scanned`, `sms_paste_applied`, `import_completed`, `assistant_message_sent {kind: text|voice}`, `assistant_transaction_saved`, `assistant_action_confirmed`, `pet_egg_chosen`, `pet_hatched`, `pet_color_set`, and `pet_enabled_set {enabled}`. Each fires once its feature returns a result (in `lib/api/<domain>.ts`, or the SMS dialog's apply), so it counts use, not only saves: a voice draft the user then discards still counts.
  - Feature use: `transaction_created {transaction_kind}`, `transaction_updated`, `transaction_deleted`, `budget_saved {scope}`, and `goal_`, `debt_`, `subscription_` `created`/`updated`/`deleted`, each sent from its `apps/web/src/lib/api/<domain>.ts` write only after the server accepted it, so every screen that writes is counted. The names match the mobile events (section 2.4), so a breakdown by `$lib` (`web` or `posthog-react-native`) compares the two clients.
- **Goal events stay first-party**: the goals chosen at setup and its events live in D1 (section 2.5), never in PostHog.
- **Financial Data Zero-Knowledge**: No transaction descriptions, amounts, categories, account balances, financial goals, debts, budgets, financial account IDs, or tenant IDs are ever captured or transmitted. The user id and email reach PostHog only through `identify()` (section 2.0), never as an event property.

### 2.2 Client-Side Web SDK Configuration

The web app's client SDK (`posthog-js`) is initialized with strict data-minimization settings. The public site (`apps/site/src/client/analytics.ts`) uses the same settings plus `cookieless_mode: "always"` and `person_profiles: "never"`, because it never identifies anyone:

```ts
posthog.init(posthogKey, {
  api_host: posthogHost, // Default: "https://us.i.posthog.com"
  persistence: "memory",
  person_profiles: "identified_only",
  capture_pageview: false, // The site sends its one pageview manually; the app sends none
  capture_pageleave: false,
  autocapture: false,
  capture_heatmaps: true, // Site: only on "/" (the landing page). App: kept for "/app" only
  disable_session_recording: true,
  disable_surveys: true,
  disable_external_dependency_loading: true,
  advanced_disable_flags: true,
  capture_performance: {
    web_vitals: true,
    web_vitals_allowed_metrics: ["LCP", "CLS", "INP"],
  },
  // App only; the public site captures no exceptions.
  capture_exceptions: {
    capture_unhandled_errors: true,
    capture_unhandled_rejections: true,
    capture_console_errors: false,
  },
});
```

- **No Cookies or LocalStorage**: `persistence: "memory"` ensures no cookies or localStorage/sessionStorage persistence keys are set, so each page load starts anonymous until the session restore identifies the account again. The app does not use `cookieless_mode`, because posthog-js ignores `identify()` in it, and does not call `opt_in_capturing`/`opt_out_capturing`, which would write the decision to localStorage; the `before_send` consent gate drops every event, `$identify` included, once Analytics is withdrawn.
- **Identified-only Person Profiles**: `person_profiles: "identified_only"` creates a person only for a signed-in account (section 2.0); anonymous events never make one.
- **No Session Replay**: Remote recording scripts and network payload capture are completely disabled.
- **Heatmaps on two pages only**: `$$heatmap` events carry click and mouse-move coordinates (with `target_fixed` and the point type), keyed by page URL, and nothing about the element clicked or its text. The site turns them on only for the landing page (`https://zoption.site/`). The app records them on every page, and `keepDashboardHeatmap` in `PostHogAnalytics.tsx` drops every point not on the dashboard (`https://app.zoption.site/app`) before the event leaves. The shared sanitizer reduces each `$heatmap_data` key to origin and path, like `$current_url`. Both pages are in the PostHog project's heatmap capture URL list (Settings → Heatmaps), which the free plan caps at 3 pages.
- **Web vitals are bundled**: the SDK's web-vitals extension is imported from `posthog-js/dist/web-vitals` in both `apps/web/src/analytics/PostHogAnalytics.tsx` and `apps/site/src/client/analytics.ts`. Without that import the SDK tries to download the extension at runtime, which the next setting forbids, and no `$web_vitals` is ever sent.
- **No External Script Ingestion**: `disable_external_dependency_loading: true` ensures that PostHog does not load external CDN scripts dynamically at runtime, maintaining full compliance with the strict Pages CSP (`script-src 'self'`). On the site, `api_host` is the same-origin `/ingest` proxy.

- **Web app error tracking**: uncaught errors and unhandled rejections are autocaptured as `$exception`, and `AppErrorBoundary` reports render failures through `captureAppException` with `source: "app-error-boundary"` (React keeps those away from `window.onerror`). The extension is bundled from `posthog-js/dist/exception-autocapture`, as web vitals are. Before sending, `scrubExceptionEvent` replaces each exception's message with its class, keeps only frame code locations (file without query, function, line, column), and drops every other `$exception_*` property, including the SDK's message copies and breadcrumb steps. The events pass the same consent gate as the rest, so nothing is sent without Analytics consent. No web source maps are uploaded yet, so frames stay minified.

### 2.3 Server-Side AI Observability (`$ai_generation`)

Server-side telemetry in `apps/api/src/assistant/posthog-ai.ts` records operational metadata for the DeepSeek AI Assistant only after user consent:

- **Allowed Fields**: Random trace/generation IDs, model identifier (e.g., `deepseek-chat`), prompt token count, completion token count, latency (ms), HTTP response status, stop reason.
- **Prohibited Fields**: No user prompts, no AI assistant answers, no tool arguments or outputs, no financial ledger context, no tenant/user identifiers.
- **Person Profile Disabled**: `$process_person_profile: false` is attached to every event.

### 2.4 Android Crash Telemetry (`$exception`)

Android telemetry in `apps/mobile/src/telemetry/telemetry.ts` sends each crash to PostHog Error Tracking as a sanitized `$exception`. Earlier builds sent a custom `mobile_crash` event with the same `source`, `type`, and `fingerprint` and no frames.

- **Allowed Fields**: Coarse exception class (e.g., `TypeError`, also used as the exception message), message-free stack frame lines (code locations only), `source` label (e.g., `root-error-boundary`), hashed `fingerprint`, `type`, and the SDK envelope. `customAppProperties` returns nothing, so no app version or build number is attached, and crashes cannot be grouped by release.
- **Prohibited Fields**: No raw error messages, no error causes, no transaction details. The signed-in account is attached by `identify()` (section 2.0), not as a crash property.
- **Source maps**: release builds upload their Hermes source map when the `POSTHOG_CLI_API_KEY` secret is set, so frames resolve to file, function, and line (`docs/mobile/security-and-privacy.md`).
- **Launch event**: `apps/mobile/app/_layout.tsx` sends one property-free `app_session_started` per launch, the first step of the launch-to-first-transaction funnel (`transaction_created` is the second). A guest's device id lives only for that launch; a signed-in launch is identified, so the funnel reads per account.
- **Product events**: each screen sends one event after a completed local write: `transaction_created`/`transaction_updated {transaction_kind}`, `transaction_deleted {transaction_kind: transaction|transfer}`, `budget_limit_set {action}`, `budget_removed`, `budget_occasion_created`, `goal_created`/`goal_updated {status}`, `goal_deleted`, `debt_created`/`debt_updated {debt_type, status}`, `debt_deleted`, `subscription_created`/`subscription_updated {billing_cycle, status}`, `subscription_deleted`, and `import_completed {file_kind, imported_count, rejected_count}`. They are not user opt-in, like crash reports (`docs/mobile/security-and-privacy.md`).
- **Feature adoption and screens**: the same adoption events as the web (section 2.1) fire from `apps/mobile/src/api/` when the feature returns a result, plus `pdf_statement_previewed` and `widget_voice_logged {entry_count}` (the home screen mic widget's headless task, after it saves). A demo session's offline stand-in results are not counted. `screen_viewed {screen}` (`src/telemetry/screen-viewed.tsx`, mounted in the authenticated gate) names each signed-in screen from a fixed map, the counterpart of the web's `page_viewed`.
- **One gate for both**: product events wait in the same bounded buffer as crash reports until the `crash-telemetry-enabled` flag answers, and are dropped while it is off, so the remote kill switch and `EXPO_PUBLIC_TELEMETRY_DISABLED` stop everything the app sends.
- **SDK Safeguards**: `personProfiles: "identified_only"` (a profile only for a signed-in account, section 2.0), `persistence: "memory"`, `captureAppLifecycleEvents: false`, `enableSessionReplay: false`. Builds before 2026-10-14 still send the older `mobile_crash` event instead of `$exception`, and builds from 2026-09-18 until account identification returned send no `$identify`, so their events stay anonymous until devices update.

### 2.5 Goal-Based Onboarding Events (D1, first-party)

The goals chosen during setup (several can be picked; the first is the lead goal) are measured from the Worker's own D1 database, not PostHog. The `goal_events` table (migration `0070_primary_goal.sql`) holds one row per step: `onboarding_goal_shown`, `onboarding_goal_selected`, `onboarding_goal_skipped`, `goal_changed` (with `from_goal`), and `first_action_completed`. A row carries the tenant id, the fixed event name, and goal and action keys from the shared enums, so it holds no amount, category, account, or free text. The optional 140 character "other" text lives only on `tenants.goal_other_text`, never in an event. `goal_events` rows are deleted with the tenant, and the goal profile is part of `account-archive.json`.

- **`first_action_completed {goal, action}`** is recorded at most once per workspace and only when it has a goal. `goalProfileRepository.get` (`apps/api/src/db/goal-profile.ts`) looks for tenant data created at or after `goal_selected_at` that matches `firstActionByGoal[goal]` (`packages/shared/src/goals.ts`): a transaction outside the opening balance category, a budget, a savings goal, a debt, a message from the user to the assistant, or an import. The event is stamped with the time of that first record, not the time of the read, so the 24 hour activation window stays honest. No feature route, middleware, or auth code reports it, and nothing is logged per request.
- The first action is noticed the next time the goal profile is read (`GET /api/app/profile/goals`, which the apps call, or the older `GET /api/app/profile/goal`, and an account export also reads it), so a workspace that never opens the app again is not counted until it does.
- Every event and the retention report are about the lead goal (`tenants.primary_goal`, the first pick). The other picks are kept in `tenants.secondary_goals` (migration `0071_secondary_goals.sql`) and are not analysed. `goal_changed` fires only when the lead goal changes.
- These events are not sent to PostHog. Adding goal events to the PostHog set in section 2.1 would need a new event in `apps/web/src/analytics/funnel.ts`, a wired surface, and a policy update.

### 2.6 Goal Retention Report

`docs/queries/goal-retention.sql` is a read-only D1 query. Per cohort (each goal, `skipped`, and `shown_no_answer`) it returns signups, the 24 hour activation rate, and D1, D7, and D30 return rates. Its header defines the cohort anchor, what counts as activity, and eligibility. In short:

- **Anchor**: `goal_selected_at` for goals (the first choice, kept if the goal later changes), the skip event time for skippers, and the shown event time for people who did not answer. Existing workspaces that never saw the goal screen are not in the report.
- **Returned on day N**: the workspace created a transaction, user assistant message, budget, savings goal, debt, or import on the calendar day (UTC) N days after the anchor day. It measures people who add something, not people who only open the app, and uses existing `created_at` columns, so no request logging was added.
- **Only finished windows count**: a workspace enters a rate's denominator only once the window is over, so young cohorts show `NULL` instead of a falsely low rate.

Run it against production (read-only), from the repository root:

```bash
pnpm --filter @zoption/api exec wrangler d1 execute budget-expense-production \
  --remote --config wrangler.deploy.jsonc --env production \
  --file ../../docs/queries/goal-retention.sql
```

Use `budget-expense-preview` with `--env preview` for preview. `apps/api/tests/goal-profile.test.ts` runs the same file against seeded workspaces to pin the numbers.

### 2.7 Feature Use per User (D1, first-party)

PostHog events from current web and mobile builds are attributed to the signed-in account (section 2.0), so PostHog's Persons view answers who uses a feature from then on. Entry methods are also recorded in D1, which covers older builds and history before identification. Every transaction create records how it was entered in `transactions.entry_method` (migration `0074_transaction_entry_method.sql`), one of `transactionEntryMethods` in `packages/shared/src/types.ts`:

| Method      | Set by                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `manual`    | The web transaction form and the mobile editor when nothing prefilled them                               |
| `voice`     | Those same forms after a voice draft (web `TransactionForm`, mobile `TransactionEditorScreen`)           |
| `widget`    | The mobile home-screen widget mic, both the background log and the review screen                         |
| `receipt`   | A mobile receipt scan, and a web receipt, which commits through the import with `entryMethod: "receipt"` |
| `sms`       | An SMS paste into the web form or the mobile editor                                                      |
| `pdf`       | A mobile PDF statement import                                                                            |
| `assistant` | The Worker, for an assistant-drafted transaction or a balance adjustment the assistant proposed          |
| `import`    | The Worker, for a CSV or Excel import commit that names no other method                                  |

The method is written once at create and never changed, returned by the API, or sent in a mobile sync pull. Rows from before migration 0074, rows from app releases that predate it, and system entries (balance adjustments made outside the assistant, subscription charges, interest credits) are `NULL`. It is deleted with the transaction and the workspace, is not sent to PostHog, and is not part of the account export.

`docs/queries/feature-usage-by-user.sql` is a read-only D1 query: one row per workspace, busiest first, with a count per method (transfers count once, deleted rows do not). It shows the verified sign-in email from `app_user_identities`, which the Worker records when someone opens the web app, and the Supabase `user_id` for people who only use the mobile app. Run it against production, read-only, from the repository root:

```bash
pnpm --filter @zoption/api exec wrangler d1 execute budget-expense-production \
  --remote --config wrangler.deploy.jsonc --env production \
  --file ../../docs/queries/feature-usage-by-user.sql
```

`apps/api/tests/feature-usage-by-user-query.test.ts` runs the file against seeded workspaces.

---

## 3. Free Tier Capacity & Quota Management

PostHog's generous Free Tier provides:

- **1,000,000 analytics events / month**
- **5,000 session recordings / month** (disabled in Zoption)
- Unlimited dashboards and team members

### Estimated Monthly Consumption

| Stream                     | Events / Unit                                     | Expected Monthly Volume      | % of Free Quota   |
| :------------------------- | :------------------------------------------------ | :--------------------------- | :---------------- |
| **Public Web Analytics**   | 1 `$pageview` + ~3 `$web_vitals` per public visit | ~10,000 – 40,000 events      | 1.0% – 4.0%       |
| **AI Observability**       | 1 `$ai_generation` per assistant request          | ~1,000 – 10,000 events       | 0.1% – 1.0%       |
| **Web app events**         | 1 `page_viewed` per page, 1 event per write       | ~5,000 – 50,000 events       | 0.5% – 5.0%       |
| **Mobile Crash Telemetry** | 1 `$exception` per rare runtime crash             | < 500 events                 | < 0.1%            |
| **Web Error Tracking**     | 1 `$exception` per uncaught error (rate limited)  | < 1,000 events               | < 0.1%            |
| **Mobile product events**  | 1 event per launch and per completed write        | ~2,000 – 20,000 events       | 0.2% – 2.0%       |
| **Total Estimated**        | —                                                 | **~18,500 – 121,500 events** | **~1.9% – 12.1%** |

### Quota Guardrails

1. Autocapture and session replay are permanently disabled. Heatmaps cover only the landing page and the app dashboard (section 2.2).
2. Authenticated routes (`/app/*`) send no `$pageview`, URL, or financial value; only the fixed-enum events in section 2.1, after Analytics consent.
3. If traffic exceeds expectations, Core Web Vitals sampling or PostHog event ingestion rate-limiting can be applied without breaking analytics integrity.

---

## 4. Unified Dashboard Specification: `Zoption Overview`

A single, consolidated PostHog dashboard named **`Zoption Overview`** should be configured in your PostHog project to monitor web traffic, performance, AI operations, and mobile stability.

### 4.1 Website Insights (Public Surface)

#### Panel 1: Public Pageviews

- **Insight Name**: `Public Pageviews`
- **Insight Type**: Trends (Line / Bar)
- **Event**: `$pageview`
- **Aggregation**: Total count
- **Breakdown**: `$current_url`
- **Filter**: `source = "web"`

#### Panel 2: Unique Anonymous Visitors

- **Insight Name**: `Unique Visitors (Cookieless)`
- **Insight Type**: Trends (Line)
- **Event**: `$pageview`
- **Aggregation**: Unique users (`distinct_id`)
- **Interval**: Daily / Weekly

#### Panel 3: Top Public Pages

- **Insight Name**: `Top Public Pages`
- **Insight Type**: Table
- **Event**: `$pageview`
- **Aggregation**: Total count
- **Group by**: `$current_url`
- **Sort**: Descending by count

#### Panel 4: Top Referring Domains

- **Insight Name**: `Referring Traffic`
- **Insight Type**: Table / Bar
- **Event**: `$pageview`
- **Aggregation**: Total count
- **Group by**: `$referring_domain` (or `$referrer`)
- **Filter**: `$referrer is set`

#### Panel 5: Core Web Vitals — Largest Contentful Paint (LCP)

- **Insight Name**: `LCP Performance (P75)`
- **Insight Type**: Trends / Value
- **Event**: `$web_vitals`
- **Aggregation**: `p75($web_vitals_LCP_value)`
- **HogQL / Formula**:
  - Good: `< 2500ms`
  - Needs Improvement: `2500ms - 4000ms`
  - Poor: `> 4000ms`

#### Panel 6: Core Web Vitals — Cumulative Layout Shift (CLS)

- **Insight Name**: `CLS Performance (P75)`
- **Insight Type**: Trends / Value
- **Event**: `$web_vitals`
- **Aggregation**: `p75($web_vitals_CLS_value)`
- **HogQL / Formula**:
  - Good: `< 0.1`
  - Needs Improvement: `0.1 - 0.25`
  - Poor: `> 0.25`

#### Panel 7: Core Web Vitals — Interaction to Next Paint (INP)

- **Insight Name**: `INP Performance (P75)`
- **Insight Type**: Trends / Value
- **Event**: `$web_vitals`
- **Aggregation**: `p75($web_vitals_INP_value)`
- **HogQL / Formula**:
  - Good: `< 200ms`
  - Needs Improvement: `200ms - 500ms`
  - Poor: `> 500ms`

---

### 4.2 AI Observability Insights (Backend Worker)

#### Panel 8: Total AI Generations & Usage Trend

- **Insight Name**: `AI Assistant Generations`
- **Insight Type**: Trends (Line / Area)
- **Event**: `$ai_generation`
- **Aggregation**: Total count
- **Interval**: Daily

#### Panel 9: AI Token Consumption (Prompt vs. Completion)

- **Insight Name**: `AI Token Consumption`
- **Insight Type**: Trends (Stacked Bar)
- **Event**: `$ai_generation`
- **Aggregations**:
  - Series A: `sum($ai_prompt_tokens)` (Prompt tokens)
  - Series B: `sum($ai_completion_tokens)` (Completion tokens)

#### Panel 10: AI Latency Distribution

- **Insight Name**: `AI Generation Latency`
- **Insight Type**: Trends (Multi-metric)
- **Event**: `$ai_generation`
- **Aggregations**:
  - `p50($ai_latency)` (Median latency)
  - `p95($ai_latency)` (95th percentile latency)
  - `avg($ai_latency)` (Average latency)

#### Panel 11: Generations by Model

- **Insight Name**: `AI Models Used`
- **Insight Type**: Pie / Breakdown
- **Event**: `$ai_generation`
- **Aggregation**: Total count
- **Breakdown**: `$ai_model`

#### Panel 12: AI Generation Error Rate & HTTP Status

- **Insight Name**: `AI Error Rate & Status`
- **Insight Type**: Trends (Stacked / Percentage)
- **Event**: `$ai_generation`
- **Aggregation**: Total count
- **Breakdown**: `$ai_http_status`
- **Filter**: `$ai_is_error is set`

---

### 4.3 Mobile Crash Insights (Android Builds)

Every crash panel has two series: `$exception` filtered to `$lib` = `posthog-react-native` (builds from 2026-10-14) and `mobile_crash` (older builds), so both show until old installs update. Both events carry `source`, `type`, and `fingerprint`.

#### Panel 13: Crash Trend

- **Insight Type**: Trends (Line), daily

#### Panel 14: Unique Crash Fingerprints

- **Insight Type**: Bar per value
- **Breakdown**: `fingerprint`

#### Panel 15: Crashes by Source

- **Insight Type**: Trends (Line)
- **Breakdown**: `source` (`root-error-boundary` or `uncaught-exception`)

#### Panel 16: Top Crash Types

- **Insight Type**: Bar per value
- **Breakdown**: `type` (coarse exception class)

### 4.4 Feature Usage (Web and Mobile)

#### Panel 17: Web App Pages

- **Insight Type**: Bar per value, last 30 days
- **Event**: `page_viewed`
- **Breakdown**: `page`

#### Panel 18: Transactions Created by Client

- **Insight Type**: Trends (Line), daily
- **Event**: `transaction_created`
- **Breakdown**: `$lib` (`web` or `posthog-react-native`)

#### Panel 19: Feature Adoption

- **Insight Type**: SQL table, last 30 days, one row per event with `web`, `mobile`, `total`, and `sessions` columns
- **Events**: `voice_entry_drafted`, `widget_voice_logged`, `receipt_scanned`, `sms_paste_applied`, `pdf_statement_previewed`, `import_completed`, `assistant_message_sent`, `assistant_transaction_saved`, `assistant_action_confirmed`, `budget_saved`, `budget_limit_set`, and the `pet_*` events
- **Aggregation**: Total count and unique users. Signed-in events count accounts; a guest's or pre-sign-in identifier lasts one page load or one app launch, so those count sessions

#### Panel 20: Mobile Screens

- **Insight Type**: Bar per value, last 30 days
- **Event**: `screen_viewed`
- **Breakdown**: `screen`

---

## 5. Dashboard Setup Instructions

1. Log into your PostHog Cloud account (e.g. `https://us.posthog.com`).
2. Navigate to **Dashboards** > **New Dashboard**.
3. Set the name to **`Zoption Overview`** and description to `Unified telemetry for Zoption Public Web, Assistant AI Observability, and Android Crash Diagnostics`.
4. Click **Add insight** and configure each of the 20 panels described above using the respective event names (`$pageview`, `$web_vitals`, `$ai_generation`, `$exception`, `page_viewed`, and the feature write events).
5. Organize the dashboard layout into 4 horizontal sections: **Website Traffic & Web Vitals**, **AI Assistant Observability**, **Mobile Diagnostics**, and **Feature Usage**.
