# Test strategy

Clarity tests financial rules at the lowest practical layer, then proves the same contracts through the API and browser. Tests use fictional PHP data and restore all mutable demo state.

## Coverage layers

- **Domain tests:** money parsing, totals, transfers, budget percentages, duplicate fingerprints, CSV parsing, and validation edge cases.
- **API tests:** request validation, CORS, transaction/category/budget/import/export contracts, failure codes, and exact CSV formatting.
- **Component tests:** transaction amount normalization and optional notes, category create/archive behavior, and budget load/save behavior.
- **Browser tests:** desktop landing-to-demo, savings/recurring insights, transaction CRUD and recategorization, account filtering, category-chart recalculation, filtered download, mixed valid/invalid import preview and commit, budget-progress recalculation, and mobile navigation.
- **Runtime checks:** local D1 migrations and seed, tenant isolation, atomic import/budget writes, token reuse rejection, duplicate detection, dashboard recalculation, and cleanup.
- **Production smoke:** landing, API/D1 readiness, CORS, dashboard contract, export, and a deliberately rejected import preview that persists no transaction or preview row.

## Repeatable commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm lighthouse
```

The Playwright teardown removes any `E2E` transactions and import audit data and restores the Food & dining July budget to exactly PHP 8,500. Tests run serially to avoid races against the shared local D1 demo tenant. The current local suite contains 32 unit/API/component tests plus one full desktop and one mobile journey. CI is configured to run the same sequence on every pull request and push to `main`; remote CI evidence remains pending until the repository is published.

## Release rule

A release is eligible only when all local/CI gates pass, both preview and production migrations succeed, and the post-deploy smoke command passes against the intended web/API pair. Authentication remains out of scope; no real financial data belongs in this public demo.
