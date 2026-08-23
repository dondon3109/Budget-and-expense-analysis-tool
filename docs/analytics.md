# Zoption Analytics & Observability Architecture

## 1. Executive Summary

Zoption consolidates its analytics and observability infrastructure into a single platform: **PostHog**.

Legacy third-party tracking mechanisms—specifically **Google Analytics 4** and the **Cloudflare Web Analytics** client beacon (`beacon.min.js`)—have been completely removed from the frontend application, dependencies, Content Security Policy (CSP), and documentation.

PostHog serves three distinct, privacy-isolated telemetry channels:
1. **Public Web Analytics & Core Web Vitals** (Client-side, cookieless, memory-only)
2. **AI Observability** (Server-side Worker metadata, `$ai_generation`)
3. **Android Crash Telemetry** (Client-side mobile, sanitized `mobile_crash`)

All telemetry is strictly bounded to protect financial privacy, avoid collecting personal or account identifiers, and operate within PostHog's generous Free Tier.

---

## 2. Privacy Boundaries & Gating

### 2.1 Public vs. Authenticated Web Surfaces
* **Public Routes Only**: PostHog Web Analytics loads and captures events **strictly** on eligible public routes (`/`, `/terms-of-service`, `/privacy-policy`, `/cookie-policy`, `/faq`, and `/install`).
* **Zero Tracking in Authenticated App**: PostHog is strictly disabled on `/app/*`, `/login`, `/signup`, `/forgot-password`, `/auth/*`, and any URL containing sensitive authentication query parameters or hash fragments (e.g., `?code=`, `#access_token=`).
* **Financial Data Zero-Knowledge**: No transaction descriptions, amounts, categories, account balances, financial goals, debts, budgets, account IDs, tenant IDs, or user IDs are ever captured or transmitted.

### 2.2 Client-Side Cookieless Web SDK Configuration
The client SDK (`posthog-js`) is initialized with strict data-minimization settings:
```ts
posthog.init(posthogKey, {
  api_host: posthogHost, // Default: "https://us.i.posthog.com"
  cookieless_mode: "always",
  persistence: "memory",
  person_profiles: "never",
  capture_pageview: false, // Manual SPA pageviews on eligible public routes only
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

* **No Cookies or LocalStorage**: `cookieless_mode: "always"` and `persistence: "memory"` ensure no cookies or localStorage/sessionStorage persistence keys are set.
* **No Person Profiles**: `person_profiles: "never"` prevents PostHog from stitching anonymous sessions or creating user records.
* **No Session Replay / Heatmaps**: Remote recording scripts and network payload capture are completely disabled.
* **No External Script Ingestion**: `disable_external_dependency_loading: true` ensures that PostHog does not load external CDN scripts dynamically at runtime, maintaining full compliance with the strict Pages CSP (`script-src 'self'`).

### 2.3 Server-Side AI Observability (`$ai_generation`)
Server-side telemetry in `apps/api/src/assistant/posthog-ai.ts` records operational metadata for the DeepSeek AI Assistant only after user consent:
* **Allowed Fields**: Random trace/generation IDs, model identifier (e.g., `deepseek-chat`), prompt token count, completion token count, latency (ms), HTTP response status, stop reason.
* **Prohibited Fields**: No user prompts, no AI assistant answers, no tool arguments or outputs, no financial ledger context, no tenant/user identifiers.
* **Person Profile Disabled**: `$process_person_profile: false` is attached to every event.

### 2.4 Android Crash Telemetry (`mobile_crash`)
Android telemetry in `apps/mobile/src/telemetry/telemetry.ts` transmits sanitized crash events:
* **Allowed Fields**: Exception class (e.g., `IllegalArgumentException`), sanitized component name (e.g., `AppNavigation`), hashed stack frame fingerprint, app version, build code, OS platform.
* **Prohibited Fields**: No raw stack traces with user values, no raw error messages, no transaction details, no user identifiers.
* **SDK Safeguards**: `personProfiles: "never"`, `persistence: "memory"`, `captureAppLifecycleEvents: false`, `enableSessionReplay: false`, and remote kill-switch support (`crash-telemetry-enabled`).

---

## 3. Free Tier Capacity & Quota Management

PostHog's generous Free Tier provides:
* **1,000,000 analytics events / month**
* **5,000 session recordings / month** (disabled in Zoption)
* Unlimited dashboards and team members

### Estimated Monthly Consumption

| Stream | Events / Unit | Expected Monthly Volume | % of Free Quota |
| :--- | :--- | :--- | :--- |
| **Public Web Analytics** | 1 `$pageview` + ~3 `$web_vitals` per public visit | ~10,000 – 40,000 events | 1.0% – 4.0% |
| **AI Observability** | 1 `$ai_generation` per assistant request | ~1,000 – 10,000 events | 0.1% – 1.0% |
| **Mobile Crash Telemetry** | 1 `mobile_crash` per rare runtime crash | < 500 events | < 0.1% |
| **Total Estimated** | — | **~11,500 – 50,500 events** | **~1.2% – 5.1%** |

### Quota Guardrails
1. Autocapture, session replay, and heatmap recordings are permanently disabled.
2. Authenticated financial routes (`/app/*`) are completely excluded from client analytics.
3. If traffic exceeds expectations, Core Web Vitals sampling or PostHog event ingestion rate-limiting can be applied without breaking analytics integrity.

---

## 4. Unified Dashboard Specification: `Zoption Overview`

A single, consolidated PostHog dashboard named **`Zoption Overview`** should be configured in your PostHog project to monitor web traffic, performance, AI operations, and mobile stability.

### 4.1 Website Insights (Public Surface)

#### Panel 1: Public Pageviews
* **Insight Name**: `Public Pageviews`
* **Insight Type**: Trends (Line / Bar)
* **Event**: `$pageview`
* **Aggregation**: Total count
* **Breakdown**: `$current_url`
* **Filter**: `source = "web"`

#### Panel 2: Unique Anonymous Visitors
* **Insight Name**: `Unique Visitors (Cookieless)`
* **Insight Type**: Trends (Line)
* **Event**: `$pageview`
* **Aggregation**: Unique users (`distinct_id`)
* **Interval**: Daily / Weekly

#### Panel 3: Top Public Pages
* **Insight Name**: `Top Public Pages`
* **Insight Type**: Table
* **Event**: `$pageview`
* **Aggregation**: Total count
* **Group by**: `$current_url`
* **Sort**: Descending by count

#### Panel 4: Top Referring Domains
* **Insight Name**: `Referring Traffic`
* **Insight Type**: Table / Bar
* **Event**: `$pageview`
* **Aggregation**: Total count
* **Group by**: `$referring_domain` (or `$referrer`)
* **Filter**: `$referrer is set`

#### Panel 5: Core Web Vitals — Largest Contentful Paint (LCP)
* **Insight Name**: `LCP Performance (P75)`
* **Insight Type**: Trends / Value
* **Event**: `$web_vitals`
* **Aggregation**: `p75($web_vitals_LCP_value)`
* **HogQL / Formula**: 
  - Good: `< 2500ms`
  - Needs Improvement: `2500ms - 4000ms`
  - Poor: `> 4000ms`

#### Panel 6: Core Web Vitals — Cumulative Layout Shift (CLS)
* **Insight Name**: `CLS Performance (P75)`
* **Insight Type**: Trends / Value
* **Event**: `$web_vitals`
* **Aggregation**: `p75($web_vitals_CLS_value)`
* **HogQL / Formula**:
  - Good: `< 0.1`
  - Needs Improvement: `0.1 - 0.25`
  - Poor: `> 0.25`

#### Panel 7: Core Web Vitals — Interaction to Next Paint (INP)
* **Insight Name**: `INP Performance (P75)`
* **Insight Type**: Trends / Value
* **Event**: `$web_vitals`
* **Aggregation**: `p75($web_vitals_INP_value)`
* **HogQL / Formula**:
  - Good: `< 200ms`
  - Needs Improvement: `200ms - 500ms`
  - Poor: `> 500ms`

---

### 4.2 AI Observability Insights (Backend Worker)

#### Panel 8: Total AI Generations & Usage Trend
* **Insight Name**: `AI Assistant Generations`
* **Insight Type**: Trends (Line / Area)
* **Event**: `$ai_generation`
* **Aggregation**: Total count
* **Interval**: Daily

#### Panel 9: AI Token Consumption (Prompt vs. Completion)
* **Insight Name**: `AI Token Consumption`
* **Insight Type**: Trends (Stacked Bar)
* **Event**: `$ai_generation`
* **Aggregations**: 
  - Series A: `sum($ai_prompt_tokens)` (Prompt tokens)
  - Series B: `sum($ai_completion_tokens)` (Completion tokens)

#### Panel 10: AI Latency Distribution
* **Insight Name**: `AI Generation Latency`
* **Insight Type**: Trends (Multi-metric)
* **Event**: `$ai_generation`
* **Aggregations**:
  - `p50($ai_latency)` (Median latency)
  - `p95($ai_latency)` (95th percentile latency)
  - `avg($ai_latency)` (Average latency)

#### Panel 11: Generations by Model
* **Insight Name**: `AI Models Used`
* **Insight Type**: Pie / Breakdown
* **Event**: `$ai_generation`
* **Aggregation**: Total count
* **Breakdown**: `$ai_model`

#### Panel 12: AI Generation Error Rate & HTTP Status
* **Insight Name**: `AI Error Rate & Status`
* **Insight Type**: Trends (Stacked / Percentage)
* **Event**: `$ai_generation`
* **Aggregation**: Total count
* **Breakdown**: `$ai_http_status`
* **Filter**: `$ai_is_error is set`

---

### 4.3 Mobile Crash Insights (Android Builds)

#### Panel 13: Total Crash Trend
* **Insight Name**: `Mobile Crash Count`
* **Insight Type**: Trends (Bar)
* **Event**: `mobile_crash`
* **Aggregation**: Total count
* **Interval**: Daily

#### Panel 14: Unique Crash Fingerprints
* **Insight Name**: `Unique Crash Issues`
* **Insight Type**: Value / Table
* **Event**: `mobile_crash`
* **Aggregation**: `count(distinct fingerprint)`

#### Panel 15: Crashes by App Version / Build
* **Insight Name**: `Crashes by App Version`
* **Insight Type**: Bar / Breakdown
* **Event**: `mobile_crash`
* **Aggregation**: Total count
* **Breakdown**: `app_version`

#### Panel 16: Most Frequent Exception Types
* **Insight Name**: `Top Exception Types`
* **Insight Type**: Table
* **Event**: `mobile_crash`
* **Aggregation**: Total count
* **Group by**: `type` (coarse exception class)
* **Sort**: Descending by count

---

## 5. Dashboard Setup Instructions

1. Log into your PostHog Cloud account (e.g. `https://us.posthog.com`).
2. Navigate to **Dashboards** > **New Dashboard**.
3. Set the name to **`Zoption Overview`** and description to `Unified telemetry for Zoption Public Web, Assistant AI Observability, and Android Crash Diagnostics`.
4. Click **Add insight** and configure each of the 16 panels described above using the respective event names (`$pageview`, `$web_vitals`, `$ai_generation`, `mobile_crash`).
5. Organize the dashboard layout into 3 horizontal sections: **Website Traffic & Web Vitals**, **AI Assistant Observability**, and **Mobile Diagnostics**.
