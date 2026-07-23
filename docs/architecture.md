# Architecture and engineering decisions

## System shape

Zoption is a React/Vite SPA backed by a Hono Cloudflare Worker and D1. Supabase Auth is the identity provider. The browser obtains a Supabase session and sends its access token to authenticated Worker routes; the Worker verifies the JWT against the project's JWKS before resolving the user's D1 tenant. Zod schemas, money handling, fingerprints, and aggregate calculations live in the shared package.

The public landing page contains a static dashboard illustration only. It does not request financial data. All real financial reads and writes require authentication.

## Authentication and tenancy

1. **Supabase manages identity, D1 manages financial data.** Passwords, confirmation, password recovery, sessions, and token refresh stay in Supabase. The application does not store passwords or access tokens in D1.
2. **Financial APIs fail closed.** `/api/app/*` requires a valid bearer token. Missing or invalid authentication returns `401` and never resolves a tenant.
3. **Identity maps to an application tenant.** `user_tenants` maps the immutable Supabase user subject to one D1 tenant.
4. **First access bootstraps structure, not financial history.** The first authenticated request creates the personal tenant, mapping, Everyday account, and starter categories. It creates no transactions or budgets.
5. **Tenant scope is mandatory.** Repositories require a tenant ID in every method signature. Route handlers obtain it only from authenticated Hono context; ownership is never accepted from request input.
6. **Browser caches are user-scoped.** Every TanStack Query key begins with `user:<id>`, and the cache is cancelled and cleared when the authenticated identity changes or signs out.

## Other engineering decisions

- Currency is Philippine pesos (`PHP`) stored as integer centavos.
- Dashboard calculations are pure and shared between API tests and UI contracts.
- CSV/XLS/XLSX import is preview-first. Excel bytes stay in a browser Web Worker; the API receives canonical CSV, an explicit header row, and editable column mappings.
- Import normalization accepts signed Amount or Debit/Credit columns and canonicalizes ISO or U.S. slash dates before fingerprinting.
- Built-in BPI, BDO, MariBank, Bank of America, and JPMorgan/Chase presets are client-side suggestions, never server-authoritative parsing rules.
- Commit consumes a short-lived, tenant-scoped token plus optional row/category overrides, validates every override, and writes the audit plus transactions atomically without mutating the saved preview.
- Imported transactions use the authenticated tenant's deterministic default account.
- Landing and feature routes are lazy-loaded; the dashboard chart bundle loads only for the private app.
- Authenticated write and import throttles use the verified tenant as their client identity.
- The first release is intentionally light-themed; a complete dark token set is a separate enhancement.

## Data conventions

- `amount_minor` is an integer. Income is positive and expense is negative.
- Transfers have their own kind and never contribute to money-in or money-out totals.
- Dates use `YYYY-MM-DD`; timestamps are UTC SQLite timestamps.
- Import fingerprints are SHA-256 hashes of normalized date, signed amount, description, and account source. Category is excluded so commit-time recategorization does not change duplicate identity.
- A unique `(tenant_id, import_fingerprint)` index prevents duplicate imported rows while allowing manual rows without fingerprints.
- Query indexes start with `tenant_id` to keep user isolation and filtering efficient.

## API boundaries

Public:

- `GET /health` — verifies that the Worker can reach D1.

Authenticated (`Authorization: Bearer <Supabase access token>`):

- `GET /api/app/me` — verified identity and resolved D1 tenant.
- `GET /api/app/dashboard?from=&to=` — tenant-scoped dashboard aggregates.
- `GET/POST/PATCH/DELETE /api/app/transactions/*` — transaction search and CRUD.
- `GET /api/app/accounts` — accounts for forms and filters.
- `GET/POST/PATCH /api/app/categories/*` — category management.
- `POST /api/app/imports/preview` and `POST /api/app/imports/commit` — tenant-scoped CSV/Excel-derived preview and atomic commit with validated category overrides.
- `GET/PUT /api/app/budgets` — monthly budget plans.
- `GET /api/app/exports/transactions.csv` — tenant-scoped CSV export.

Browser origins are checked through the configured allow-list. CORS preflight allows `Authorization` before authentication middleware runs. Private responses use `Cache-Control: no-store`, and detailed unexpected failures remain server-side.

## Reliability and security strategy

- JWT tests use generated local key pairs, not a live Supabase project or checked-in credentials.
- API tests inject auth verification and tenant resolution while asserting that repositories receive authenticated scope.
- Tenant bootstrap tests prove deterministic IDs and atomic idempotent creation.
- Repository joins and mutations include tenant predicates, preventing guessed cross-tenant references.
- Frontend tests verify route guards, bearer attachment, one refresh retry, final unauthorized sign-out, and user-scoped query keys.
- Desktop/mobile browser tests cover the public account entry points, retired public-data route, and signed-out private-route redirects.
- The production smoke check covers landing delivery, D1 readiness, retired public-data response, and denial of unauthenticated private access without mutating records.

See [test strategy](test-strategy.md), [performance results](performance.md), and the [deployment runbook](deployment.md).
