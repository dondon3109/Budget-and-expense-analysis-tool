# Clarity engineering case study

## Problem

Personal finance imports are easy to make visually appealing but hard to make trustworthy. Clarity needed deterministic PHP arithmetic, understandable errors, a safe CSV workflow, responsive analysis, and a public demo that never implies bank connectivity or private-data protection it does not provide.

## Approach

The solution uses a small Cloudflare-native boundary: React/Vite in Pages, a Hono Worker, D1, and shared Zod/TypeScript rules. Every owned row is tenant-scoped from migration one. Currency is stored as integer centavos, transfers are excluded from income/expense totals, and the same validated account/category/date/type filters drive the transaction table and CSV export.

CSV import is preview-first. The server parses and normalizes rows, reports row-specific problems and duplicates, and issues a short-lived one-time token only when at least one row can be committed. Commit atomically writes approved transactions and an audit record. This avoids preview/commit drift and partial imports.

## Reliability and speed

Financial rules are unit-tested, HTTP contracts are API-tested, interactive mutations are component-tested, and Playwright proves the full desktop/mobile journey against local D1 with exact cleanup. The dashboard bounds database reads to the requested period and useful trend window. Pagination, export ceilings, and import limits keep expensive operations predictable.

The public demo also needs protection from automated writes. D1-backed atomic windows limit general mutations and apply a tighter import policy across Worker instances. Only a SHA-256 client hash is persisted. A local runtime proof confirmed requests 1–20 reached validation and request 21 received `429`, with no financial rows created.

The measured production landing build scores 100 in all four Lighthouse categories, with 490–534 ms LCP, zero CLS, and a 101.9 KB transfer. These are reproducible local lab results; field performance remains to be measured after launch.

## Scope and outcome

The complete demo—including transaction CRUD, account filtering, recategorization, mixed-row import, budgets, recurring/savings insights, dashboard recalculation, and export—is implemented and verified. Separate preview and production Pages, Worker, and D1 resources are live on Cloudflare’s free domains, with isolated migrations and fictional seed data. Both environments passed the production smoke gate, and direct browser inspection confirmed the desktop dashboard and mobile transactions layout without console errors or horizontal overflow. Authentication, bank connections, multiple currencies, and financial advice remain intentionally excluded.
