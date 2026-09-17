# Scope: Zoption web app

The browser product in `apps/web`: a public site that explains Zoption and brings people in, and the signed in app where someone records, reads, and plans their money. This scope covers that workspace only. The Worker and the native app get their own scopes.

**Build approach:** Tracer Bullet (each feature runs end to end through every layer and works, then widens).
**Workflow:** GA (after `/develop`: `/check verify`, `/test`, a fresh model `/check review`, then `/document`). A feature tagged `· Beta` stops after `/test`. `/architect` is the recommended first stop for a feature with a real decision, and skippable when you already know the build, so any feature can also carry a tag to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| #   | Feature                                  | Phase   | Status   |
| --- | ---------------------------------------- | ------- | -------- |
| A   | Public marketing site                    | Built   | existing |
| B   | Search content library and page pipeline | Built   | existing |
| C   | Signup, sign in, and recovery            | Built   | existing |
| D   | App shell, themes, and first run         | Built   | existing |
| E   | Dashboard and money overview             | Built   | existing |
| F   | Transactions and categories              | Built   | existing |
| G   | Budgets and share links                  | Built   | existing |
| H   | Calendar and subscriptions               | Built   | existing |
| I   | Financial plan                           | Built   | existing |
| J   | Statement import                         | Built   | existing |
| K   | Receipt photo entry                      | Built   | existing |
| L   | AI assistant and voice                   | Built   | existing |
| M   | Pro billing and sponsored seats          | Built   | existing |
| N   | Settings, account safety, and support    | Built   | existing |
| O   | Platform admin                           | Built   | existing |
| P   | Consent, analytics, and install          | Built   | existing |
| 1   | Search demand pages                      | Slice 1 | done     |
| 2   | Signup funnel measurement                | Slice 1 | done     |
| 3   | Content freshness guard                  | Slice 2 | done     |

## Built before this scope

### A. Public marketing site · existing

Landing page with product tours, a private versus bank linked comparison, an Android install promo, and customer reviews, plus pricing, FAQ, changelog, install, thank you, and the three legal pages.
Code in `apps/web/src/pages/LandingPage.tsx`, `apps/web/src/pages/pricing/`, `apps/web/src/pages/legal/`

### B. Search content library and page pipeline · existing

Hubs and long form pages that target search demand, meaning the guides, one import guide per supported bank, the 50/30/20 peso calculator, and tutorials, together with the machinery that publishes them: per route metadata, prerendered HTML, structured data, sitemap, robots, and `llms.txt`.
Code in `apps/web/src/pages/guides/`, `apps/web/src/pages/import/`, `apps/web/src/pages/tools/`, `packages/shared/src/financeGuides.ts`, `apps/web/src/seo/siteMetadata.ts`, `apps/web/scripts/prerender.mjs`

### C. Signup, sign in, and recovery · existing

Email and Google accounts, email confirmation and identity linking, password recovery and update, the auth callback, and the route guards around the private app.
Code in `apps/web/src/pages/SignupPage.tsx`, `apps/web/src/pages/LoginPage.tsx`, `apps/web/src/components/auth/`, `apps/web/src/auth/`

### D. App shell, themes, and first run · existing

The signed in shell with Light, Dark, and Coffee themes, the startup gate, the empty first run experience, the quick start tour, and the in app release notes.
Code in `apps/web/src/components/layout/`, `apps/web/src/components/theme/`, `apps/web/src/components/dashboard/QuickStartTutorial.tsx`, `apps/web/src/components/releases/`

### E. Dashboard and money overview · existing

Monthly totals, category spending, the six month trend, budget progress, the goals and subscriptions panel, and recent transactions.
Code in `apps/web/src/pages/DashboardPage.tsx`, `apps/web/src/components/dashboard/`

### F. Transactions and categories · existing

Create, edit, delete, filter, sort, paginate, and export transactions, manage categories, paste an SMS notification, and dictate a transaction by voice.
Code in `apps/web/src/pages/TransactionsPage.tsx`, `apps/web/src/components/transactions/`

### G. Budgets and share links · existing

Monthly budget editing per category with a spending comparison, plus a share link that publishes a sanitized budget snapshot to a public page.
Code in `apps/web/src/pages/BudgetsPage.tsx`, `apps/web/src/components/budgets/ShareBudgetModal.tsx`, `apps/web/src/pages/shared/SharedBudgetPage.tsx`

### H. Calendar and subscriptions · existing

A month calendar of money events, subscription tracking with a renewal calendar, cancellation guides, and a cashflow forecast.
Code in `apps/web/src/pages/CalendarPage.tsx`, `apps/web/src/pages/SubscriptionsPage.tsx`, `apps/web/src/components/subscriptions/`

### I. Financial plan · existing

Savings goals and debt payoff planning with avalanche and snowball projections, plus a remittance cost calculator.
Code in `apps/web/src/pages/FinancialPlanPage.tsx`, `apps/web/src/components/planning/`

### J. Statement import · existing

Preview first CSV, XLSX, and XLS import with bank presets, duplicate prevention, a spreadsheet migration wizard, and one atomic commit.
Code in `apps/web/src/pages/ImportPage.tsx`, `apps/web/src/components/onboarding/SpreadsheetMigrationWizard.tsx`

### K. Receipt photo entry · existing

Draft a transaction from a receipt photo behind its own consent, with the image never stored and the same preview and duplicate checks as import.
Code in `apps/web/src/components/receipts/`

### L. AI assistant and voice · existing

A tenant scoped assistant with chat, hands free voice conversation, a memory panel, provider consent, and answers grounded in backend tools.
Code in `apps/web/src/pages/AssistantPage.tsx`, `apps/web/src/components/assistant/`

### M. Pro billing and sponsored seats · existing

The Pro checkout dialog for monthly and annual plans, plan usage limits and upgrade prompts, billing settings, cancellation, and sponsored Pro seats.
Code in `apps/web/src/components/billing/`, `apps/web/src/components/account/BillingSettings.tsx`

### N. Settings, account safety, and support · existing

Account settings, avatar and theme choices, cookie preferences, the review prompt, permanent account deletion, the support chat, and bug reports.
Code in `apps/web/src/pages/SettingsPage.tsx`, `apps/web/src/components/account/`, `apps/web/src/components/support/`

### O. Platform admin · existing

Operator pages for the platform overview, customer review moderation, and AI provider configuration.
Code in `apps/web/src/pages/AdminOverviewPage.tsx`, `apps/web/src/pages/AdminCustomerReviewsPage.tsx`, `apps/web/src/pages/AdminProviderConfigsPage.tsx`

### P. Consent, analytics, and install · existing

Versioned cookie consent with a preferences dialog, cookieless PostHog pageviews, and the install page with direct Android beta links.
Code in `apps/web/src/components/consent/`, `apps/web/src/analytics/PostHogAnalytics.tsx`, `apps/web/src/pages/InstallPage.tsx`

## Slice 1: Search to signup thread

### 1. Search demand pages · done · Beta

New public pages that answer demand `docs/seo.md` named and never built: the Philippine budgeting guides and the feature explainers. Each page has to point at a strength the product really has, such as centavo accuracy, statement import, GCash and Maya tracking, or no bank connection.
**Done when:** the first page is live and crawlable through the whole pipeline (metadata manifest, prerender, sitemap, internal links), the rest of the chosen set follows the same path, and no page claims something the web app cannot do.

- [x] Design it (spec): `/architect search demand pages`
- [x] Build it: `/develop search demand pages`
  - [x] Salary budgeting guide and the guide set test
  - [x] 50/30/20 in pesos guide with calculator links
  - [x] `/features/` route family in the manifest and the router
  - [x] Receipt scanning and voice entry pages with cross links
- [x] Verify it: `/check verify search demand pages`
- [x] Test it: `/test search demand pages`

Spec [0001](../specs/web/0001-search-demand-pages.md) · code in `apps/web/src/pages/features/`, `packages/shared/src/financeGuides.ts`, `apps/web/src/seo/siteMetadata.ts`

### 2. Signup funnel measurement · done

Make the path from a new page visit to a first import readable. Today the public site records pageviews and nothing else, so the metric that matters, signup to first import, cannot be read at all.
**Done when:** a visit, a signup start, a first app load, a first import, assistant consent, and a first assistant question each show up as one step of a single funnel, no event carries financial or identity detail, and the policies name the events.

- [x] Design it (spec): `/architect signup funnel measurement`
- [x] Build it: `/develop signup funnel measurement`
  - [x] Funnel module with the closed event schema
  - [x] Signup and first app load events
  - [x] Workspace transaction total read and the first import event
  - [x] Assistant consent and first question events, plus policy copy
- [x] Verify it: `/check verify signup funnel measurement`
- [x] Test it: `/test signup funnel measurement`
- [x] Review it: `/check review signup funnel measurement`
- [x] Document it: `/document signup funnel measurement`

Spec [0002](../specs/web/0002-signup-funnel-measurement.md) · code in `apps/web/src/analytics/funnel.ts`, `apps/web/src/pages/SignupPage.tsx`, `apps/web/src/pages/ImportPage.tsx`

## Slice 2: Content upkeep

### 3. Content freshness guard · done · Beta

Every public page declares a last modified date, `docs/seo.md` requires that date to stay honest, and nothing enforces it yet. Search engines hold a finance site to a strict accuracy bar, so a stale or future dated page is a real risk.
**Done when:** CI fails when a page's declared date no longer matches the last commit that touched its sources, and a new public route with no source mapping fails loudly instead of passing silently.

- [x] Build it: `/develop content freshness guard`

Code in `apps/web/src/seo/contentSources.ts`, `apps/web/tests/content-freshness.test.ts`

## Deferred

Out of scope for this pass, kept so the plan stays honest.

- **Search Console and keyword data**: replace the qualitative demand research with real query data · needs a decision
- **Activation to first import**: shorten the path from a new account to its first imported or recorded transaction · needs a decision
- **Sharing and referral loop**: turn the public shared budget page into an acquisition loop, the second channel in play · needs a decision
- **PDF statement import on web**: the landing page advertises PDF statements while the web importer accepts only CSV, XLSX, and XLS · needs a decision
- **Tagalog public pages**: Tagalog landing, pricing, and guides, with language routing and metadata · needs a decision
- **More bank guides**: add a guide only after its import preset exists · needs a decision
- **A small paid test**: a budgeted experiment with conversion tracking behind it · needs a decision

## Legend

**The decision box.** Every feature carries exactly one box whose label ends with `(spec)`. `/architect` ticks it and fills in the built ready shape; every other box is execution work it never touches.
**Status.** `planned` → `in-progress` → `done`. `existing` means the feature predates this scope, and later skills leave it alone. `dropped` keeps a row that left the scope, for history.
**Workflow tier.** The header sets the project default. A `· Beta` tag beside a heading stops that feature after `/test`; what closes `done` is `/test` at GA and Beta, `/check verify` at Alpha, and `/develop` at Prototype.
**Pointer line.** `spec <n> · code in <path>`, added by `/architect` for the spec and by `/develop` for the code.
**Next step.** The first unticked box in build order.
