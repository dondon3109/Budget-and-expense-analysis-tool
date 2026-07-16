# Architecture and engineering decisions

## System shape

Clarity remains Cloudflare-native: a React/Vite single-page application talks to a Hono Worker, and the Worker persists structured data in D1. Zod schemas, money handling, fingerprints, and aggregate calculations live in a shared package so browser labels, API responses, exports, and tests use the same rules.

## Adjustments to the original plan

1. **Explicit tenant scope from the first migration.** The schema includes a `tenants` table and requires `tenant_id` on every owned record. The public sample is an explicit `demo` tenant. Authentication remains deferred, but adding it later will not require retrofitting ownership into financial tables.
2. **One currency in the first release.** The demo uses Philippine pesos (`PHP`) and stores integer centavos. Currency conversion remains out of scope; this removes ambiguous arithmetic and keeps all summaries deterministic.
3. **Shared calculations before editable UI.** Dashboard totals, category shares, trend data, and budget progress are pure functions with fixtures. Routes and charts consume the same result contract.
4. **Performance by delivery boundary.** Landing and dashboard routes are lazy-loaded. Recharts is downloaded only when the demo dashboard opens, keeping the public introduction light.
5. **Preview-first writes.** CSV parsing produces a validated, expiring preview token; commit accepts that server-issued token rather than trusting a second client-supplied parse. This prevents the preview and persisted rows from diverging.
6. **Bounded aggregate reads.** The dashboard loads the requested period plus at most the six-month trend window and only the applicable budget month, so response work does not grow with the full transaction history.
7. **Durable demo abuse protection.** Write and import limits use atomic D1 counters rather than isolate-local memory. Client addresses are SHA-256 hashed before storage, expired windows are cleaned opportunistically, and rejected requests return `429` with a retry interval.
8. **Intentional light theme for the first release.** The portfolio UI declares a light color scheme so native controls do not switch into a mismatched partial dark mode. A full dark token set remains optional after production evidence, rather than shipping an unverified hybrid theme.

## Data conventions

- `amount_minor` is an integer. Income is positive and expense is negative.
- Transfers have their own kind and never contribute to money-in or money-out totals.
- Dates use `YYYY-MM-DD`; timestamps are UTC SQLite timestamps.
- Import fingerprints are SHA-256 hashes of normalized date, amount, description, and account source.
- A unique `(tenant_id, import_fingerprint)` index prevents duplicate imported rows while allowing manually entered rows without fingerprints.
- Query indexes start with `tenant_id` to keep future user isolation and filtering efficient.

## API boundaries

The current slice exposes:

- `GET /health` — verifies that the Worker can reach D1.
- `GET /api/dashboard?from=&to=` — validates the date range and returns the shared dashboard contract.
- `GET /api/transactions` — tenant-scoped search, type/category/date filters, sorting, and pagination.
- `GET /api/accounts` — tenant-scoped accounts for forms and account filters.
- `POST /api/transactions` — validates references and creates a normalized transaction.
- `PATCH /api/transactions/:id` and `DELETE /api/transactions/:id` — tenant-scoped corrections and removal.
- `GET /api/categories`, `POST /api/categories`, and `PATCH /api/categories/:id` — list, create, rename, recolor, archive, and restore categories.
- `POST /api/imports/preview` — enforces file limits, validates mapped CSV rows, checks duplicates, and stores only normalized ready rows behind a short-lived token.
- `POST /api/imports/commit` — consumes the tenant-scoped token once and atomically writes its transactions and import audit.
- `GET /api/budgets?month=` and `PUT /api/budgets` — read calculated budget-vs-actual values and atomically upsert a monthly category plan.
- `GET /api/exports/transactions.csv` — exports up to 5,000 tenant-scoped rows using the same validated filters and sort rules as the transaction list.

Every browser API request is checked against configured origins. Detailed failures remain server-side; clients receive stable generic error identifiers.

## Reliability strategy

- Financial rules are pure and unit-tested.
- Route behavior is tested without requiring a remote Cloudflare account.
- Migrations and realistic seed data are versioned.
- Production builds dry-run the actual Worker bundle.
- Persisted product workflows fail visibly instead of silently replacing database errors with mock data.
- Local runtime verification covers transaction writes, dashboard recalculation, cleanup, and cross-tenant isolation.
- Import runtime verification proves preview is read-only, commit changes totals exactly once, token reuse fails, and existing fingerprints are detected.
- Budget and export verification proves monthly plans recalculate dashboard totals and CSV output honors category/date filters with exact minor-unit amounts.
- Account filtering uses the same validated account ID in lists and exports, backed by a tenant/account index.
- Dashboard insights calculate savings and detect expenses repeated in at least three distinct recent months.
- Direct local-D1 verification proves the 21st import request in a 15-minute window receives `429`, counters contain only 64-character client hashes, and financial records remain unchanged.
- Automated desktop/mobile journeys cover the complete demo and restore every created record and edited budget.
- A post-deploy smoke command validates the live origin, D1 readiness, dashboard contract, CSV export, and a fully rejected import preview without changing financial records.

See [test strategy](test-strategy.md), [performance results](performance.md), and the [deployment runbook](deployment.md).
