# Zoption Analytics & Observability Architecture

## 1. Executive Summary

Zoption consolidates its analytics and observability infrastructure into a single platform: **PostHog**.

Legacy third-party tracking mechanisms—specifically **Google Analytics 4** and the **Cloudflare Web Analytics** client beacon (`beacon.min.js`)—have been completely removed from the frontend application, dependencies, Content Security Policy (CSP), and documentation.

PostHog serves three distinct, privacy-isolated telemetry channels:

1. **Public site pageviews, web funnel events, and Core Web Vitals** (Client-side, cookieless, memory-only)
2. **AI Observability** (Server-side Worker metadata, `$ai_generation`)
3. **Android Crash Telemetry** (Client-side mobile, sanitized `mobile_crash`)

All telemetry is strictly bounded to protect financial privacy, avoid collecting personal or account identifiers, and operate within PostHog's generous Free Tier.

---

## 2. Privacy Boundaries & Gating

### 2.1 Public vs. Authenticated Web Surfaces

- **Consent first**: nothing is captured until the visitor grants the Analytics cookie category. Without that stored decision, or without a configured key, every capture is a silent no-op.
- **Pageviews on the public site only**: `zoption.site` (`apps/site/src/client/analytics.ts`) sends one `$pageview` per page load, only on a built manifest page (not the 404), and never when the query carries anything but campaign parameters or the fragment carries auth state (`isTrackableUrl` in `apps/site/src/lib/trackableUrl.ts`). The module itself downloads only after consent. When an AI answer engine sent the visit (ChatGPT, Perplexity, Claude, Gemini, Copilot, DeepSeek, Meta AI, You.com), the pageview carries `ai_referrer` with the engine's name and nothing else from the referrer.
- **Same-origin ingestion on the site**: the site posts to its own `/ingest` Pages Function (`apps/site/functions/ingest/[[path]].ts`), which forwards only PostHog capture endpoints to `us.i.posthog.com` and strips cookies and client address headers, so the site CSP keeps `connect-src 'self'` for analytics and blocklists aimed at the PostHog host do not drop consented events.
- **Six funnel events in the app**: the app at `app.zoption.site` sends no pageviews. Its signup page and signed-in app send only the closed set in `apps/web/src/analytics/funnel.ts` (`signup_viewed`, `signup_submitted`, `app_session_started`, `first_import_committed`, `assistant_consent_granted`, `assistant_first_question`). Their only properties are fixed enums, and the page-load events fire at most once per page load.
- **Goal events stay first-party**: the goal chosen at setup and its events live in D1 (section 2.5), never in PostHog.
- **Financial Data Zero-Knowledge**: No transaction descriptions, amounts, categories, account balances, financial goals, debts, budgets, account IDs, tenant IDs, or user IDs are ever captured or transmitted.

### 2.2 Client-Side Cookieless Web SDK Configuration

The client SDK (`posthog-js`) is initialized with strict data-minimization settings:

```ts
posthog.init(posthogKey, {
  api_host: posthogHost, // Default: "https://us.i.posthog.com"
  cookieless_mode: "always",
  persistence: "memory",
  person_profiles: "never",
  capture_pageview: false, // The site sends its one pageview manually; the app sends none
  capture_pageleave: false,
  autocapture: false,
  disable_session_recording: true,
  disable_surveys: true,
  disable_external_dependency_loading: true,
  advanced_disable_flags: true,
  capture_performance: {
    web_vitals: true,
    web_vitals_allowed_metrics: ["LCP", "CLS", "INP"],
  },
});
```

- **No Cookies or LocalStorage**: `cookieless_mode: "always"` and `persistence: "memory"` ensure no cookies or localStorage/sessionStorage persistence keys are set.
- **No Person Profiles**: `person_profiles: "never"` prevents PostHog from stitching anonymous sessions or creating user records.
- **No Session Replay / Heatmaps**: Remote recording scripts and network payload capture are completely disabled.
- **No External Script Ingestion**: `disable_external_dependency_loading: true` ensures that PostHog does not load external CDN scripts dynamically at runtime, maintaining full compliance with the strict Pages CSP (`script-src 'self'`). On the site, `api_host` is the same-origin `/ingest` proxy.

### 2.3 Server-Side AI Observability (`$ai_generation`)

Server-side telemetry in `apps/api/src/assistant/posthog-ai.ts` records operational metadata for the DeepSeek AI Assistant only after user consent:

- **Allowed Fields**: Random trace/generation IDs, model identifier (e.g., `deepseek-chat`), prompt token count, completion token count, latency (ms), HTTP response status, stop reason.
- **Prohibited Fields**: No user prompts, no AI assistant answers, no tool arguments or outputs, no financial ledger context, no tenant/user identifiers.
- **Person Profile Disabled**: `$process_person_profile: false` is attached to every event.

### 2.4 Android Crash Telemetry (`mobile_crash`)

Android telemetry in `apps/mobile/src/telemetry/telemetry.ts` transmits sanitized crash events:

- **Allowed Fields**: Exception class (e.g., `IllegalArgumentException`), sanitized component name (e.g., `AppNavigation`), hashed stack frame fingerprint, app version, build code, OS platform.
- **Prohibited Fields**: No raw stack traces with user values, no raw error messages, no transaction details, no user identifiers.
- **SDK Safeguards**: `personProfiles: "never"`, `persistence: "memory"`, `captureAppLifecycleEvents: false`, `enableSessionReplay: false`, and remote kill-switch support (`crash-telemetry-enabled`).

### 2.5 Goal-Based Onboarding Events (D1, first-party)

The goal chosen during setup is measured from the Worker's own D1 database, not PostHog. The `goal_events` table (migration `0070_primary_goal.sql`) holds one row per step: `onboarding_goal_shown`, `onboarding_goal_selected`, `onboarding_goal_skipped`, `goal_changed` (with `from_goal`), and `first_action_completed`. A row carries the tenant id, the fixed event name, and goal and action keys from the shared enums, so it holds no amount, category, account, or free text. The optional 140 character "other" text lives only on `tenants.goal_other_text`, never in an event. `goal_events` rows are deleted with the tenant, and the goal profile is part of `account-archive.json`.

- **`first_action_completed {goal, action}`** is recorded at most once per workspace and only when it has a goal. `goalProfileRepository.get` (`apps/api/src/db/goal-profile.ts`) looks for tenant data created at or after `goal_selected_at` that matches `firstActionByGoal[goal]` (`packages/shared/src/goals.ts`): a transaction outside the opening balance category, a budget, a savings goal, a debt, a message from the user to the assistant, or an import. The event is stamped with the time of that first record, not the time of the read, so the 24 hour activation window stays honest. No feature route, middleware, or auth code reports it, and nothing is logged per request.
- The first action is noticed the next time the goal profile is read (`GET /api/app/profile/goal`, which the web app calls, and an account export also reads it), so a workspace that never opens the app again is not counted until it does.
- These events are not sent to PostHog. The anonymous PostHog funnel in section 2.1 stays at six events; adding goal events there would need a new event in `apps/web/src/analytics/funnel.ts`, a wired surface, and a policy update.

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

---

## 3. Free Tier Capacity & Quota Management

PostHog's generous Free Tier provides:

- **1,000,000 analytics events / month**
- **5,000 session recordings / month** (disabled in Zoption)
- Unlimited dashboards and team members

### Estimated Monthly Consumption

| Stream                     | Events / Unit                                     | Expected Monthly Volume     | % of Free Quota  |
| :------------------------- | :------------------------------------------------ | :-------------------------- | :--------------- |
| **Public Web Analytics**   | 1 `$pageview` + ~3 `$web_vitals` per public visit | ~10,000 – 40,000 events     | 1.0% – 4.0%      |
| **AI Observability**       | 1 `$ai_generation` per assistant request          | ~1,000 – 10,000 events      | 0.1% – 1.0%      |
| **Mobile Crash Telemetry** | 1 `mobile_crash` per rare runtime crash           | < 500 events                | < 0.1%           |
| **Total Estimated**        | —                                                 | **~11,500 – 50,500 events** | **~1.2% – 5.1%** |

### Quota Guardrails

1. Autocapture, session replay, and heatmap recordings are permanently disabled.
2. Authenticated financial routes (`/app/*`) are completely excluded from client analytics.
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

#### Panel 13: Total Crash Trend

- **Insight Name**: `Mobile Crash Count`
- **Insight Type**: Trends (Bar)
- **Event**: `mobile_crash`
- **Aggregation**: Total count
- **Interval**: Daily

#### Panel 14: Unique Crash Fingerprints

- **Insight Name**: `Unique Crash Issues`
- **Insight Type**: Value / Table
- **Event**: `mobile_crash`
- **Aggregation**: `count(distinct fingerprint)`

#### Panel 15: Crashes by App Version / Build

- **Insight Name**: `Crashes by App Version`
- **Insight Type**: Bar / Breakdown
- **Event**: `mobile_crash`
- **Aggregation**: Total count
- **Breakdown**: `app_version`

#### Panel 16: Most Frequent Exception Types

- **Insight Name**: `Top Exception Types`
- **Insight Type**: Table
- **Event**: `mobile_crash`
- **Aggregation**: Total count
- **Group by**: `type` (coarse exception class)
- **Sort**: Descending by count

---

## 5. Dashboard Setup Instructions

1. Log into your PostHog Cloud account (e.g. `https://us.posthog.com`).
2. Navigate to **Dashboards** > **New Dashboard**.
3. Set the name to **`Zoption Overview`** and description to `Unified telemetry for Zoption Public Web, Assistant AI Observability, and Android Crash Diagnostics`.
4. Click **Add insight** and configure each of the 16 panels described above using the respective event names (`$pageview`, `$web_vitals`, `$ai_generation`, `mobile_crash`).
5. Organize the dashboard layout into 3 horizontal sections: **Website Traffic & Web Vitals**, **AI Assistant Observability**, and **Mobile Diagnostics**.
