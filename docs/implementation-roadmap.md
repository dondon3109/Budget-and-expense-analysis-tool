# Implementation roadmap

The current product goal is an authenticated budgeting workspace with a public marketing/authentication surface, strict tenant isolation, reliable import and calculation rules, and reproducible deployment evidence.

## Milestone 1 — Foundation and analysis

Status: complete.

- [x] pnpm monorepo with strict TypeScript, ESLint, Prettier, and shared configuration.
- [x] React/Vite frontend, Hono Worker, shared domain package, and Drizzle/D1 schema.
- [x] Safe minor-unit parsing, transfer classification, duplicate fingerprinting, totals, budget percentages, and empty/over-budget tests.
- [x] D1-backed `/health`, validated financial APIs, and origin checks.
- [x] Responsive landing page and accessible dashboard components.
- [x] Route-level code splitting, lint, typecheck, tests, and production build.

## Milestone 2 — Transactions, categories, and CSV

Status: complete.

- [x] Tenant-scoped transaction repository and validated CRUD routes.
- [x] Search, sorting, filters, pagination, edit, delete, and accessible forms.
- [x] Starter categories plus create/rename/archive behavior.
- [x] Account-aware forms, lists, filters, and CSV export.
- [x] Preview-first CSV mapping, row validation, duplicate detection, one-time commit tokens, and atomic persistence.
- [x] API and component coverage for valid input, invalid input, not found, and stable failures.

## Milestone 3 — Budgets and insights

Status: complete.

- [x] Monthly budget read/atomic-upsert API and responsive editor.
- [x] Budget-vs-actual and income-vs-expense views.
- [x] Savings-rate and recurring-expense insights from a bounded six-month window.
- [x] Filtered CSV export using the same transaction-table rules.
- [x] Loading, partial-data, empty, recoverable-error, and narrow mobile states.

## Milestone 4 — Authenticated persistence

Status: implemented locally; hosted configuration and deployment remain.

- [x] Supabase Auth for identity while retaining D1 for financial data.
- [x] JWKS verification and mapping of verified identities to separate D1 tenants.
- [x] Atomic bootstrap of a personal account and starter categories without transactions or budgets.
- [x] Protected application routes, authenticated financial APIs, and user-scoped browser caches.
- [x] Signup, confirmation, login, password recovery, session refresh, and sign-out.
- [x] Tenant-scoped write/import rate limiting and authenticated CSV export.
- [x] Authentication boundary, tenant bootstrap, API scope, route guard, and browser tests.

## Milestone 5 — Public surface and retired shared data

Status: implemented; deployment verification remains.

- [x] Landing page prioritizes account creation and sign in.
- [x] Dashboard artwork is static and explicitly illustrative.
- [x] Public financial route and runtime seed are removed.
- [x] Frontend workspace types and UI are authenticated-only.
- [x] New users receive a polished empty-workspace onboarding state.
- [x] Forward D1 migration removes only the retired public tenant and dependent rows.
- [x] Tests, smoke checks, screenshots, and current documentation match the authenticated-only boundary.
- [ ] Apply the cleanup migration to preview after creating a recovery point and inspect tenant preservation.
- [ ] Promote the verified migration and application release to production.

## Milestone 6 — Production and privacy readiness

- [x] GitHub Actions gates for install, lint, typecheck, tests, build, and Lighthouse.
- [x] Non-mutating post-deploy smoke command.
- [x] Architecture, data rules, test strategy, performance results, deployment runbook, and case study.
- [ ] Configure hosted Supabase callback URLs and environment values.
- [ ] Complete preview and production two-user isolation checks.
- [ ] Rehearse Pages, Worker, and D1 rollback.
- [ ] Add complete account-data export, account deletion, and formal retention/privacy controls.
- [ ] Add field performance monitoring and review Worker logs after normal traffic.
