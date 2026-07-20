# Implementation roadmap

This roadmap converts the product plan into an executable goal. The definition of done remains the one in the source PDF: a visitor can use the demo workflow end to end on the custom domain; calculations and imports are proven by tests; desktop/mobile budgets and charts work; all CI gates pass; deployment, DNS, HTTPS, CORS, and rollback are verified; and the portfolio documentation is complete.

## Milestone 1 — Foundation and read-only product slice

Status: complete.

- [x] pnpm monorepo with strict TypeScript, ESLint, Prettier, and shared configuration.
- [x] React/Vite frontend, Hono Worker, shared domain package, Drizzle/D1 schema.
- [x] Explicit demo tenant and ownership-ready indexes.
- [x] Realistic PHP demo data, repeatable migration, and seed.
- [x] Safe minor-unit parsing, transfer classification, duplicate fingerprinting, totals, budget percentages, and empty/over-budget tests.
- [x] D1-backed `/health` and `/api/dashboard` endpoints with request validation and origin checks.
- [x] Responsive landing page and accessible read-only dashboard.
- [x] Route-level code splitting, lint, typecheck, tests, and production build.
- [x] Component smoke tests and the first Playwright journey.

Exit gate: a fresh checkout can install, migrate, seed, start, and reproduce the same July dashboard totals.

## Milestone 2 — Core transaction and category workflow

Status: complete.

- [x] Transaction repository with tenant scope enforced inside every query.
- [x] Paginated/filterable `GET /api/transactions`.
- [x] Validated create, edit, and delete routes.
- [x] Default categories plus create/rename/archive behavior.
- [x] Transactions page with search, sorting, filters, pagination, edit, delete, and accessible forms.
- [x] Tenant-scoped account list plus account-aware form, list, and export filtering with a meaningful savings-account fixture.
- [x] API tests for valid input, invalid input, not found, and route contracts.
- [x] Local D1 verification for create/edit/delete totals and cross-tenant isolation.
- [x] Component tests for transaction and category interactions.

Exit gate: a demo visitor can add, correct, filter, and remove a transaction and see dashboard totals update.

## Milestone 3 — CSV preview and commit

Status: complete.

- [x] Documented CSV template and flexible column mapping.
- [x] File-size and row-count limits enforced before parsing or row preparation.
- [x] Row-level date, description, PHP currency, category/type, and amount validation.
- [x] Stable duplicate detection against existing and within-file rows.
- [x] Server-issued, one-time preview token with a 15-minute lifetime.
- [x] Atomic commit and import audit record.
- [x] Import wizard with mapping, preview, actionable errors, and result summary.
- [x] Fixtures for valid, mixed-error, duplicate, non-PHP, and oversized imports.
- [x] Local D1 verification that preview writes nothing, commit updates totals once, token reuse fails, and later previews detect duplicates.

Exit gate: preview never writes data; commit writes only approved valid rows once and refreshes dashboard totals.

## Milestone 4 — Budgets, export, and complete demo

Status: complete.

- [x] Monthly budget read/atomic-upsert API and responsive editor.
- [x] Budget-vs-actual and income-vs-expense views.
- [x] Savings-rate and recurring-expense insights from the bounded six-month window.
- [x] Filtered CSV export using the same search, type, category, date, and sorting rules as the UI.
- [x] Empty, loading, recoverable error, and narrow mobile states.
- [x] Local D1 verification that budget changes persist, recalculate the dashboard, and restore exactly; filtered export returns only matching rows in the selected order.
- [x] Main E2E journeys: landing → demo, CRUD, import, recategorize, budget, export, mobile, and clean teardown.
- [x] E2E assertions for account filtering, invalid-row feedback, category-chart refresh, and budget-progress refresh.

Exit gate: the full demo journey works on desktop and mobile with no hidden mock-only behavior.

## Milestone 5 — Production and portfolio readiness

- [x] GitHub Actions gates configured: install, lint, typecheck, unit/API/component/E2E tests, build, and Lighthouse.
- [x] Local full gate passes: 32 unit/API/component tests, 2 desktop/mobile E2E journeys, production builds, and Lighthouse.
- [x] Lighthouse accessibility and best-practice scores at 100; measured performance budget documented.
- [ ] Separate preview and production D1 resources.
- [ ] Cloudflare Worker and Pages deployments with environment-specific CORS.
- [x] Non-mutating post-deploy smoke command for landing, health/D1, dashboard/CORS, import preview, and export.
- [x] D1-backed mutation/import throttling with hashed client identifiers and direct 20-allowed/21st-rejected runtime proof.
- [ ] Subdomain DNS, HTTPS, canonical redirects, and tested rollback.
- [x] Architecture diagram, data rules, test strategy, performance results, privacy limitations, deployment runbook, and case study.
- [x] Reproducible, visually verified local desktop/mobile portfolio screenshots.
- [ ] Recapture production screenshots after the custom domain is live.

Exit gate: the production URL and repository tell a complete, reproducible engineering story.

## Milestone 6 — Authenticated persistence

Status: implemented locally; hosted environment configuration and deployment remain.

- [x] Select Supabase Auth as the Worker-compatible identity provider while retaining D1 for financial data.
- [x] Verify Supabase JWTs through JWKS and map verified identities to separate D1 tenants.
- [x] Bootstrap starter accounts/categories and require tenant scope throughout every repository.
- [x] Protect application routes, make the public demo read-only, and scope browser caches by user.
- [x] Add authentication boundary, tenant bootstrap, API scope, route guard, and browser tests.
- [x] Keep transaction CSV export behind authenticated tenant scope.
- [ ] Configure hosted Supabase callback URLs and environment values, migrate preview/production D1, and deploy.
- [ ] Add complete account-data export, account deletion, and formal retention/privacy controls.

## NotebookLM input

NotebookLM authentication is available, but no notebook is currently registered in the local NotebookLM library. When a project notebook share URL is provided and approved for registration, its requirements should be reconciled against this roadmap before the remaining workflows are finalized.
