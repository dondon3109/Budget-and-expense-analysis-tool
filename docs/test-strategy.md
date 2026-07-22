# Test strategy

Clarity tests financial and identity boundaries at the lowest practical layer, then proves the same contracts through the API and browser. Unit/API tests use fictional identities and locally generated JWT keys; they do not require live Supabase credentials.

## Coverage layers

- **Domain tests:** money parsing, totals, transfers, budget percentages, duplicate fingerprints, header-aware CSV parsing, import date normalization, Amount/Debit/Credit mapping, and validation edge cases.
- **Authentication tests:** locally signed JWTs prove signature, issuer, audience, subject, and configuration validation without contacting Supabase.
- **Tenant tests:** deterministic IDs and one atomic, idempotent D1 bootstrap batch for the personal tenant, mapping, account, and categories. Bootstrap must not create transactions or budgets.
- **API tests:** retired public-data endpoint, unauthenticated/invalid-token rejection, CORS preflight, authenticated tenant propagation, rate-limit identity, request validation, transaction/category/budget/import/export contracts, Debit/Credit and slash-date normalization, commit-time category override authorization, atomic rejection, and stable failures.
- **Frontend tests:** route guards, intended-destination redirects, landing account actions, static-preview labeling, bearer-token attachment, one refresh retry, final unauthorized sign-out, user-scoped query keys, first-use dashboard detection, bank preset matching, header selection, PHP confirmation, import pagination, cross-page bulk categories, workbook-client lifetime, input/drop parity, and persistent theme behavior.
- **Browser tests:** desktop/mobile landing behavior, initial system theme, persisted theme changes across routes and reloads, signup/login navigation, retired `/demo` redirect, explicit denial of anonymous private API access, and private-route redirects.
- **Runtime checks:** local D1 migrations, private API denial, production builds, and the empty-workspace path.
- **Production smoke:** landing, API/D1 readiness, retired endpoint `404`, anonymous private-route denial, and authenticated-request CORS preflight. The smoke check is non-mutating.

## Repeatable commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm lighthouse
```

The secret-free local and CI suites do not create live Supabase users. Before deployment, run a separate manual or gated two-user flow against the intended Supabase preview project to prove first-login bootstrap, empty financial history, and cross-user data isolation through the real identity service.

## Release rule

A release is eligible only when local/CI gates pass, preview and production D1 migrations succeed, Supabase redirect URLs and public environment values are configured, the post-deploy smoke command passes, and the two-user authenticated isolation flow succeeds. Financial data must never be reachable without a verified bearer token, and the public landing page must not request financial APIs.
