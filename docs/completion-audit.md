# Completion audit

“Implemented” means source and focused automated evidence exist. “Locally verified” additionally means the real Vite/Worker/D1 path was exercised. “Live verified” requires a separate deployment and inspection step.

## Implemented and locally testable

- Public landing page with clear signup/login entry points and a static, labeled product illustration.
- Supabase email/password signup, confirmation, login, recovery, session refresh, and sign-out flows.
- Fail-closed authenticated application routes and Worker APIs.
- Per-user D1 tenant resolution and atomic bootstrap of an account plus starter categories only.
- Empty first-use onboarding with import and manual-entry actions.
- Manual transaction create/edit/delete, category management, account/category/type/date/search filters, sorting, pagination, and filter-matched CSV export.
- Preview-first CSV mapping, size/row limits, field-specific errors, duplicate prevention, one-time expiring commit tokens, and atomic persistence.
- Integer-centavo PHP rules, ISO dates, UTC timestamps, transfer exclusion, stable fingerprints, tenant scope, and owner-first indexes.
- Category spending, six-month money-in/out trend, budget-vs-actual, savings rate, and recurring-expense insights.
- Loading, empty, recoverable-error, keyboard/focus, text-chart-equivalent, contrast, reduced-motion, desktop, and mobile states.
- D1-backed write/import rate limits keyed by authenticated tenant identity.
- Unit, API, component, desktop/mobile Playwright, production-build, and Lighthouse gates.
- README, architecture/data rules, CSV guide, test strategy, performance results, privacy limitations, deployment/rollback runbook, case study, and reproducible public screenshots.

## Deployment verification required for this change

- Create a D1 recovery point in preview and production before the cleanup migration.
- Apply the cleanup migration and verify only the retired public tenant was removed.
- Deploy the Worker and Pages build with current Supabase variables and allowed origins.
- Run the non-mutating smoke gate: landing, health/D1 readiness, retired endpoint `404`, anonymous private API denial, and authenticated CORS preflight.
- Complete the two-user authenticated isolation flow and confirm each new user starts without transactions or budgets.
- Inspect desktop/mobile pages for console errors and horizontal overflow.

## Operational follow-up

- Retain remote CI evidence for the release commit.
- Review Worker logs after normal traffic for repeated 5xx responses.
- Rehearse Pages, Worker, and D1 rollback after a second compatible release exists.
- Add account-data export, account deletion, and formal retention/privacy controls before a broader public launch.
