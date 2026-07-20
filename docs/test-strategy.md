# Test strategy

Clarity tests financial and identity boundaries at the lowest practical layer, then proves the same contracts through the API and browser. Unit/API tests use fictional identities and locally generated JWT keys; they do not require live Supabase credentials.

## Coverage layers

- **Domain tests:** money parsing, totals, transfers, budget percentages, duplicate fingerprints, CSV parsing, and validation edge cases.
- **Authentication tests:** locally signed JWTs prove signature, issuer, audience, subject, and configuration validation without contacting Supabase.
- **Tenant tests:** deterministic IDs and one atomic, idempotent D1 bootstrap batch for the personal tenant, mapping, account, and categories.
- **API tests:** public demo/read-only boundaries, unauthenticated/invalid-token rejection, CORS preflight, authenticated tenant propagation, rate-limit identity, request validation, transaction/category/budget/import/export contracts, and stable failures.
- **Frontend tests:** route guards, intended-destination redirects, bearer-token attachment, one refresh retry, final unauthorized sign-out, workspace-scoped query keys, and component behavior.
- **Browser tests:** desktop landing-to-demo behavior, explicit denial of anonymous private API access, private-route redirects, and mobile read-only demo navigation.
- **Runtime checks:** local D1 migrations and seed, dashboard delivery, private API denial, and production builds.
- **Production smoke:** landing, API/D1 readiness, public dashboard contract and CORS, anonymous private-route denial, and authenticated-request CORS preflight. The smoke check is non-mutating.

## Repeatable commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm lighthouse
```

The secret-free local and CI suites do not create live Supabase users. Before deployment, run a separate manual or gated two-user flow against the intended Supabase preview project to prove first-login bootstrap and cross-user data isolation through the real identity service.

## Release rule

A release is eligible only when local/CI gates pass, preview and production D1 migrations succeed, Supabase redirect URLs and public environment values are configured, the post-deploy smoke command passes, and the two-user authenticated isolation flow succeeds. The public demo must remain read-only; private financial data must never be reachable without a verified bearer token.
