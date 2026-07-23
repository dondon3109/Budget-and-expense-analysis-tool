# Zoption engineering case study

## Problem

Personal finance tools are easy to make visually appealing but hard to make trustworthy. Zoption needed deterministic PHP arithmetic, understandable errors, a safe CSV workflow, responsive analysis, and a clear boundary between public product information and private financial records.

## Approach

The solution uses React/Vite in Cloudflare Pages, a Hono Worker, D1, Supabase Auth, and shared Zod/TypeScript rules. Every owned row is tenant-scoped. Currency is stored as integer centavos, transfers are excluded from income/expense totals, and the same validated filters drive the transaction table and CSV export.

Supabase owns account identity and sessions. The Worker verifies each bearer token through JWKS, maps the user to a D1 tenant, and bootstraps only an account plus starter categories on first access. Transactions and budgets begin empty. The landing page therefore uses a clearly labeled static illustration rather than serving public financial records.

CSV import is preview-first. The server parses and normalizes rows, reports row-specific problems and duplicates, and issues a short-lived one-time token only when at least one row can be committed. Commit atomically writes approved transactions and an audit record, avoiding preview/commit drift and partial imports.

## Reliability and speed

Financial rules are unit-tested, HTTP contracts are API-tested, interactive mutations are component-tested, and Playwright covers public account entry points plus signed-out private-route boundaries. The dashboard bounds database reads to the requested period and useful trend window. Pagination, export ceilings, and import limits keep expensive operations predictable.

D1-backed atomic windows limit authenticated mutations and apply a tighter import policy across Worker instances. Rate-limit identity comes from the verified tenant, not a user-supplied value. Only a SHA-256 client hash is persisted for the limiter.

The measured landing build is held to Lighthouse performance, accessibility, best-practice, SEO, LCP, CLS, and bundle-size gates. These are reproducible local lab results; field performance should be monitored after each hosted release.

## Scope and outcome

Zoption now provides authenticated transaction CRUD, account filtering, recategorization, mixed-row import, budgets, recurring/savings insights, dashboard recalculation, and export in isolated personal workspaces. New users get an intentional onboarding state instead of fictional records. Public visitors can understand the product and choose signup or login without exposing a shared financial dataset.

Separate preview and production Pages, Worker, and D1 resources are documented for deployment. Bank connections, multiple currencies, financial advice, complete account-data export, and formal retention/deletion controls remain outside the current scope.
