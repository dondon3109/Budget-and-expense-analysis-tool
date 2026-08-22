# Test strategy

Zoption tests financial and identity boundaries at the lowest practical layer, then proves the same contracts through the API and browser. Unit/API tests use fictional identities and locally generated JWT keys; they do not require live Supabase credentials.

## Coverage layers

- **Domain tests:** money parsing, totals, transfers, budget percentages, transaction-ledger account balances, debt avalanche/snowball projections, savings-goal contributions, recurring-charge detection, anomaly detection, strict assistant inputs, duplicate fingerprints, header-aware CSV parsing, import date normalization, Amount/Debit/Credit mapping, and validation edge cases.
- **Authentication tests:** locally signed JWTs prove signature, issuer, audience, subject, and configuration validation without contacting Supabase.
- **Tenant tests:** deterministic IDs and one atomic, idempotent D1 bootstrap batch for the personal tenant, mapping, account, and categories. Bootstrap must not create transactions or budgets. Account-deletion tests prove a tombstoned subject returns `410` before bootstrap and cannot recreate a workspace with a retained access token.
- **API tests:** retired public-data endpoint, unauthenticated/invalid-token rejection, HTTPS-only non-local identity configuration, CORS preflight, security headers, authenticated tenant propagation, write and bulk-read rate-limit identity, media-type/body-size enforcement, strict request validation, server-side account-deletion password verification, no-tenant-bootstrap deletion routing, deletion saga ordering, idempotent pending cleanup, transaction/category/budget/import/export/goal/debt contracts, account balance ownership, assistant compliance and date policy, required-tool enforcement, backend-formatted money, answer validation and fallback, sanitized audit snapshots, data-quality limitations, provider boundaries, Debit/Credit and slash-date normalization, commit-time category override authorization, atomic rejection, and stable failures.
- **Frontend tests:** route guards, intended-destination redirects, Google OAuth initiation and safe callbacks, provider loading/failure states, provider-only password creation, landing account actions, static-preview labeling, bearer-token attachment, one refresh retry, final unauthorized sign-out, user-scoped query keys, renewed assistant consent, plain-text rendering, response provenance, data-quality details, topic disclaimers, transaction-derived balance display, goals/debts forms and planning summaries, assistant coaching preferences, first-use dashboard detection, bank preset matching, header selection, PHP confirmation, import pagination, cross-page bulk categories, workbook-client lifetime, input/drop parity, persistent theme behavior, versioned fail-closed browser consent, cross-tab synchronization, optional integration gating/cleanup, accessible consent controls, exact legal routes, policy disclosures, and shared legal footers.
- **Browser tests:** desktop/mobile landing behavior, initial system theme, persisted theme changes across routes and reloads, first-visit consent sequencing and persistence, legal-route direct navigation, footer Cookie Settings, signup/login navigation, retired `/demo` redirect, explicit denial of anonymous private API access, and private-route redirects.
- **Runtime checks:** local D1 migrations, private API denial, production builds, and the empty-workspace path.
- **Production smoke:** landing and security headers, exact expected API/Supabase origins in CSP and frontend assets, forbidden Supabase-origin absence, centralized API-binding/D1 readiness, retired endpoint `404`, anonymous private-route denial, and authenticated-request CORS preflight. The smoke check is non-mutating.

## Persistence and convergence harnesses

- API repository tests use a shared SQLite-backed `D1Database` harness that applies the complete
  production migration chain. Tests must seed writable source tables rather than inserting into
  production views such as `effective_pro_entitlements`.
- Mobile persistence tests apply the real encrypted-workspace schema migrations and execute local
  row plus outbox mutations inside SQLite transactions.
- The focused convergence suite models two installations against one tenant-scoped server database.
  It proves idempotent retry, stale-revision conflict, subsequent pull convergence, deletion
  tombstones, and tenant-isolated bootstrap.
- Node SQLite remains the fast repository layer. A small Workers-runtime/D1 integration layer should
  cover runtime binding and migration semantics without duplicating the repository suite.

## Structured-data verification

Public structured data has three complementary gates:

1. **Unit tests** prove every public metadata entry is an accurate linked Schema.org graph: a shared `WebSite`, a homepage `WebApplication`, and legal `WebPage` entities with stable canonical IDs, visible feature claims, and maintained content dates. They also reject unsupported identity, pricing, review, rating, breadcrumb, FAQ, search-action, and business-location claims.
2. **Prerender artifact verification** parses each generated managed JSON-LD script and compares it with its route metadata, so a build fails if serialization, route ownership, canonical relationships, or semantic graph structure drift.
3. **Production smoke** parses deployed public HTML and verifies the same graph shape, IDs, relationships, and noindex boundaries. Private and authentication routes must not emit managed JSON-LD.

## Repeatable commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm lighthouse
```

The secret-free local and CI suites do not create live Supabase users. Before deployment, run a separate manual or gated two-user flow against the intended Supabase preview project to prove first-login bootstrap, empty financial history, and cross-user data isolation through the real identity service. Also use a direct Supabase client to prove the provider rejects passwords outside the 12-character mixed-class policy, requires confirmation before first sign-in, requires recent authentication for password changes, and gives the application indistinguishable signup behavior for new and existing addresses. For Google, sign into an existing password account with the same verified email and confirm Supabase adds the provider identity to the same Auth user ID and Zoption opens the same D1 workspace; do not infer deduplication only from matching email text in the UI.

## Release rule

A release is eligible only when local/CI gates pass, preview and production D1 migrations succeed, Supabase redirect URLs and public environment values are configured, the post-deploy smoke command passes, and the two-user authenticated isolation flow succeeds. Inspect deployed Pages and Worker responses for CSP, HSTS, framing, MIME-sniffing, referrer, CORS, private-cache, media-type, body-limit, and read/export rate-limit behavior. Inspect built HTML to confirm the theme bootstrap is external and no optional SDK, script, pixel, iframe, preconnect, beacon, or request occurs before category consent. Resolve all legal-policy placeholders through business/legal review. Financial data must never be reachable without a verified bearer token, and the public landing page must not request financial APIs.
