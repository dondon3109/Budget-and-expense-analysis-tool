# Architecture and engineering decisions

## System shape

Clarity remains Cloudflare-native for application data: a React/Vite SPA talks to a Hono Worker, and the Worker persists structured financial records in D1. Supabase Auth is the identity provider. The browser obtains a Supabase session and sends its access token to authenticated Worker routes; the Worker verifies the JWT against the project's JWKS before resolving the user's D1 tenant. Zod schemas, money handling, fingerprints, and aggregate calculations remain in the shared package.

## Authentication and tenancy

1. **Supabase manages identity, D1 manages financial data.** Passwords, confirmation flows, password recovery, sessions, and token refresh stay in Supabase. The application does not store passwords or access tokens in D1.
2. **Private APIs fail closed.** `/api/app/*` requires a valid bearer token. Missing or invalid authentication returns `401`; it never falls back to the demo tenant.
3. **Identity maps to an application tenant.** `user_tenants` maps the immutable Supabase user subject to one D1 tenant. The first authenticated request atomically creates the mapping, a personal tenant, an Everyday account, and starter categories.
4. **Tenant scope is mandatory.** Repositories require a tenant ID in every method signature. Route handlers obtain it only from authenticated Hono context; ownership is never accepted from query parameters or request bodies.
5. **The public demo is explicit and read-only.** `/api/demo/dashboard` is the only demo data endpoint. Transaction, category, budget, import, and export operations exist only under `/api/app/*`.
6. **Browser caches are workspace-scoped.** Every TanStack Query key begins with `demo` or `user:<id>`, and the cache is cancelled and cleared when the authenticated user changes or signs out.

## Other engineering decisions

- Currency remains Philippine pesos (`PHP`) stored as integer centavos.
- Dashboard calculations remain pure and shared between API tests and UI contracts.
- CSV imports remain preview-first: commit consumes a short-lived, tenant-scoped server token and writes the audit plus transactions atomically.
- Imported transactions use the authenticated tenant's deterministic default account rather than a global demo account ID.
- Landing and feature routes remain lazy-loaded; the dashboard chart bundle is loaded only when needed.
- Authenticated write and import throttles use the verified tenant as their client identity. Supabase independently applies limits to authentication actions.
- The first release intentionally remains light-themed; a complete dark token set is a separate enhancement.

## Data conventions

- `amount_minor` is an integer. Income is positive and expense is negative.
- Transfers have their own kind and never contribute to money-in or money-out totals.
- Dates use `YYYY-MM-DD`; timestamps are UTC SQLite timestamps.
- Import fingerprints are SHA-256 hashes of normalized date, amount, description, and account source.
- A unique `(tenant_id, import_fingerprint)` index prevents duplicate imported rows while allowing manually entered rows without fingerprints.
- Query indexes start with `tenant_id` to keep user isolation and filtering efficient.

## API boundaries

Public:

- `GET /health` — verifies that the Worker can reach D1.
- `GET /api/demo/dashboard?from=&to=` — returns the fictional read-only dashboard.

Authenticated (`Authorization: Bearer <Supabase access token>`):

- `GET /api/app/me` — returns the verified user identity and resolved D1 tenant.
- `GET /api/app/dashboard?from=&to=` — returns tenant-scoped dashboard aggregates.
- `GET/POST/PATCH/DELETE /api/app/transactions/*` — transaction search and CRUD.
- `GET /api/app/accounts` — accounts for forms and filters.
- `GET/POST/PATCH /api/app/categories/*` — category management.
- `POST /api/app/imports/preview` and `POST /api/app/imports/commit` — tenant-scoped CSV import.
- `GET/PUT /api/app/budgets` — monthly budget plans.
- `GET /api/app/exports/transactions.csv` — tenant-scoped CSV export.

Browser origins are checked through the configured allow-list. CORS preflight allows `Authorization` before authentication middleware runs. Private responses use `Cache-Control: no-store`, and detailed unexpected failures remain server-side.

## Reliability and security strategy

- JWT tests use generated local key pairs, not a live Supabase project or checked-in credentials.
- API tests inject auth verification and tenant resolution boundaries while asserting that every repository receives authenticated scope.
- Tenant bootstrap tests prove deterministic IDs and atomic idempotent creation.
- Repository joins and mutations include tenant predicates, preventing guessed cross-tenant references from succeeding.
- Frontend tests verify route guards, bearer attachment, one refresh retry, final unauthorized sign-out, and workspace-scoped query keys.
- Desktop/mobile browser tests prove the public demo remains read-only and private pages redirect signed-out users.
- The production smoke check covers landing delivery, D1 readiness, public dashboard CORS, and denial of unauthenticated private access without mutating financial records.

See [test strategy](test-strategy.md), [performance results](performance.md), and the [deployment runbook](deployment.md).
