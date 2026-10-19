# apps/api

## Overview

The Cloudflare Worker that owns authentication enforcement, tenant data, and financial truth for Zoption. It is a Hono app that verifies the Supabase token on every private request, resolves the caller's D1 tenant, and serves the `/api/app/*` surface used by the browser and the native clients.

## Stack

- **Language / Runtime**: TypeScript on Cloudflare Workers
- **Framework**: Hono
- **Data**: Cloudflare D1 (SQLite). The core ledger repositories (`accounts`, `budgets`, `categories`, `dashboard`, `debts`, `events`, `goals`, `imports`, `subscriptions`, `transactions`) and `src/exports/archive.ts` build queries with Drizzle over the repo root `../../db/schema.ts`; everything else uses hand written `env.DB.prepare` and `env.DB.batch`. Match the style of the file you edit
- **Key dependencies**: `@zoption/shared` for zod schemas, Wrangler for dev and deploy
- **Tests**: Vitest, run from the repo root through the root `vitest.config.ts`

## Key files

| File                            | Owns                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `src/index.ts`                  | Worker entry: `fetch`, `queue`, `scheduled`, and the rate limit Durable Object     |
| `src/app.ts`                    | `createApp`: middleware order, auth, `/health`, route mounts, error handling       |
| `src/composition.ts`            | `AppOptions` and `createDependencies`: every default repository, provider, service |
| `src/http/cors.ts`              | Origin allowlist, CORS preflight, and security headers                             |
| `src/http/body-limits.ts`       | Per path content type and body size rules                                          |
| `src/http/rate-limit-policy.ts` | Per path rate limit policies and whether a request is keyed by user or tenant      |
| `src/auth.ts`                   | Supabase JWT verification against the project JWKS                                 |
| `src/readiness.ts`              | Required binding validation for `/health`, the queue, and the cron entries         |
| `src/db/`                       | One repository per entity; tenant data methods take `tenantId`                     |
| `src/db/mobile-sync.ts`         | Route facing sync facade; owns the push loop and its batch                         |
| `src/db/mobile-sync/`           | Protocol, read, compaction, and the `push/` handlers beside the facade             |
| `src/routes/`                   | Hono route modules, one per surface, mounted in `src/app.ts`                       |
| `../../db/migrations/`          | Forward only SQL migrations that Wrangler applies in file name order               |

## Commands

```bash
pnpm --filter @zoption/api dev        # wrangler dev on 127.0.0.1:8787
pnpm --filter @zoption/api dev:lan    # wrangler dev on 0.0.0.0:8787, for device testing over Wi-Fi
pnpm --filter @zoption/api build      # wrangler deploy --dry-run
pnpm --filter @zoption/api typecheck
pnpm --filter @zoption/api test       # the root Vitest `api` project; append a path to filter
pnpm verify:api                       # typecheck, lint, format, and tests for this package
pnpm db:migrate:local                 # apply db/migrations to the local D1 database
```

## Conventions

- Route modules export `createXRoutes(dependency)` and are mounted centrally in `src/app.ts`, which takes each dependency from `createDependencies` in `src/composition.ts`. A new dependency gets an `AppOptions` field and a default there. Do not import a repository inside a route; pass it through the factory. `admin-provider-configs`, `provider-credentials`, and `voice-stream` still import singletons and are the only lint exceptions (`eslint.config.mjs`).
- Validate at the boundary with a `@zoption/shared` zod schema through `parseInput(schema, value, <message>)` in `src/request.ts`, which answers `400 invalid_request` with the flattened field errors. Bodies go through `readJson`, path ids through `parsePathParameter`. Call `safeParse` directly only when a failure needs a different status, code, or detail. About 30 older handlers still call `safeParse` and answer `400 invalid_request` without `details`; switching them changes the response body, so do it deliberately rather than in passing.
- Body limits and rate limits are decided per method and path in `src/http/`. A path that gets its own rule needs a row in `tests/http-policy.test.ts`, which pins every current rule.
- Only `HttpError` carries a client visible message. An unexpected failure is logged as one structured JSON line and returned as a bare `500 internal_server_error`.
- Every method that reads or writes tenant data takes `tenantId`. Handlers read it from `context.get("tenant").tenantId` and never from request input. System-scoped methods (subscription renewals, billing webhooks and due checkouts, bug reports, provider configs and credentials, platform admin, account deletion, voice tickets) take no tenant; never feed them one derived from request input.
- Tables use snake_case columns; TypeScript fields are camelCase.
- Tests live flat in `apps/api/tests/`, named in kebab case, with shared helpers under `tests/helpers/`. Repository tests build their database with `createD1TestDatabase`.

## Gotchas

- Migrations run in file name order, so two files sharing a prefix sort by the rest of the name (`0034_mobile_sync_foundation.sql` before `0034_receipt_consent.sql`). Renaming a migration silently changes the order.
- A migration must work with the Worker version already deployed. `Production Release` applies migrations before it deploys the new Worker, so the old code serves traffic against the new schema for the length of the deploy, and indefinitely if the deploy step fails or the Worker is rolled back. Add columns and tables first, stop reading an old one in a later release, and drop it only after that. The table rebuild pattern (create, copy, drop, rename) is fine when the rebuilt table keeps every column the deployed code reads.
- Drizzle metadata is stale on purpose: `../../db/migrations/meta/` stops at `0015`, so `pnpm db:generate` would emit one migration covering everything since then. Write new migrations by hand.
- Never insert into a view in tests. `effective_plan_access` (the Worker's tier view: paid subscriptions, family coverage, sponsored seats, platform admins, and trials) and `paid_plan_subscriptions` are recreated by migrations; seed the base tables instead. `effective_pro_access` and `effective_pro_entitlements` remain only for the previously deployed Worker.
- D1 refuses a compound SELECT with more than five terms (`UNION`/`UNION ALL` arms), though local SQLite allows 500. `createD1TestDatabase` sets the same limit, so a view or query that grows past five fails in tests; merge arms with `CASE` or nest the unions.
- Do not add fields or enum values to a mobile sync payload without a client feature. Installed apps validate the whole pull response strictly and reject an unknown key or value, so a new shape goes only to clients that send its name in `x-zoption-sync-features` (`mobileSyncFeatures`, shaped in `src/db/mobile-sync/features.ts`; see `docs/mobile/sync-protocol.md`). `tests/mobile-sync-released-contracts.test.ts` replays every supported app release's frozen contract and fails when a change breaks one. A data backfill migration must bump `revision`.
- Money is integer centavos end to end (`amount_minor`). Expenses are negative, transfers count once, and assistant output must never show centavos or a peso symbol.
- There are two loopback checks with different rules. `isLoopbackOrigin` in `src/auth.ts` gates the dev access token and accepts only `http://localhost`, `127.0.0.1`, and `[::1]`. `isLoopbackHost` in `src/readiness.ts` validates configured URLs and also accepts `*.localhost`. Use the stricter one for anything security related.
- Tenant resolution is skipped for `DELETE /api/app/account` and `/api/app/admin/*`; `context.get("tenant")` is unset on those paths, so their rate limits are keyed by the signed-in user.
- A request acts in the caller's personal workspace unless it sends `X-Zoption-Workspace` naming a family. The resolver accepts that only through the caller's own `tenant_members` row (`403 workspace_forbidden` otherwise) and sets `tenant.membership`. Only the prefixes in `FAMILY_WORKSPACE_PATHS` (`src/auth.ts`) accept a family; any other path answers `400 workspace_not_supported`, and a viewer's non-GET request `403 workspace_read_only`. Add a surface to that list only once its handlers are safe for a shared workspace. A family's currency (`PUT /api/app/settings`) is owner only, and a member edits or deletes only the family transactions they added (`created_by_user_id`, checked through `EntryAccess`); rows without an author are owner only. Mobile sync accepts a family only from clients declaring `family-workspaces`, which get `authorUserId` on transaction payloads; its push runs the same rules through `src/db/mobile-sync/family.ts` (`docs/mobile/sync-protocol.md`).
- Families are managed in two places. `/api/app/families/*` acts as the signed-in person (create, answer invitations, leave) and never takes the header; `/api/app/family/*` acts on the family the header names, with every write owner only. Invitations are bound to an email and accepted only by the person whose verified email (`app_user_identities`, synced by `POST /api/app/identity`) matches. The seat cap, cooldowns, and yearly swap cap read `family_seat_events`; the seat cap and one-owner rule are enforced in SQL and unique indexes, not in a read-then-write. `FAMILY_WORKSPACES_ENABLED` gates creating a family and stays `false` in deployed Workers until the Family plan ships.
- A family plan (Family Budget or Family Pro) is a `billing_subscriptions` row in the payer's personal tenant whose `family_tenant_id` names the family; the owner buys, changes, and cancels it through `/api/app/family/billing/*` with the family header, and its checkout is confirmed through the owner's personal `/api/app/billing/reconcile`. `tenant.membership.plan` is `unpaid` (never paid: the owner alone writes, at Free limits, and invitations are refused), `active`, or `lapsed` (was paid: the auth middleware answers every non-GET with `403 workspace_lapsed`, except `LAPSED_FAMILY_WRITES` in `src/auth.ts`, so the owner can still pay, transfer, or close it). Every member of an active family gets the plan's tier personally through `effective_plan_access`; a member who pays more keeps the higher tier. AI actions and imports stay personal.
- Closing a family (`POST /api/app/family/close`, owner only) adds a `family_closures` row. From then on the auth middleware refuses every non-GET request in that family with `403 workspace_closing`, so members can only read and export it (`/api/app/exports` accepts a family). The daily maintenance cron deletes it after `FAMILY_CLOSING_DAYS`, using the same `tenantDataStatements` list as account deletion, so a new tenant table belongs in that list. `family_seat_events` are kept for the join cooldown. A closing family no longer blocks its owner's account deletion.
- Sharing into a family reads every source row from the caller's personal tenant (`tenantIdForUser`), never from request input: `/api/app/family/shares/*` writes into the family the header names, and `/api/app/families/balance-shares` acts as the person. A copied transaction is an ordinary family row plus a `family_transaction_shares` link, one per source per family. Both of its transaction foreign keys cascade, so deleting either row drops the link and a deleted copy can be shared again. It is the only table with a foreign key to `transactions`, so a rebuild of `transactions` must defer foreign keys or it deletes the links. A balance share reads the source account live until it is frozen, which happens on stop, on leaving or removal (`freeSeat`), first in `tenantDataStatements` before a purge, and on the next family read once the account is archived.
- Family ledger rows stay hard deleted. `family_transaction_events` (`src/db/family-journal.ts`) records each family edit (before and after) and each delete with the raw transaction and transfer group rows, written by the transactions route before the delete runs and withdrawn if it fails. `/api/app/family/transactions/:id/restore` re-inserts those rows under the same ids within `FAMILY_RESTORE_DAYS`: the owner restores any delete, anyone else only their own. A restored copy is not re-linked to the personal row it was shared from. Personal rows keep no history.
- Family comments (`family_comments`, `/api/app/family/comments/:kind/:subjectId`) hang off a transaction or remittance id with no foreign key, so a deleted entry's thread returns with it. A new comment notifies the subject's author and earlier commenters (`comment_reply`). `src/family-alerts.ts` owns the other family alerts and the owner's thresholds (`family_alert_settings`, `/api/app/family/alerts`; no row means `FAMILY_ALERT_DEFAULTS`, null turns one off): a family expense at or above the spending threshold tells the owner (`family_spending`), the expense that takes "Left" below the low-balance floor tells everyone once (`low_balance`), and the daily maintenance cron sends each open family's owner a digest of the entries dated the previous Manila day (`family_digest`). Expense alerts fire when an expense is created, through `POST /api/app/transactions` or a mobile sync push, not on edits.
- A family transaction has at most one receipt photo (`family_receipts`, `src/db/family-receipts.ts`) in the private `RECEIPTS` R2 bucket under `receipts/<familyTenantId>/`. It is served only through `GET /api/app/family/receipts/:transactionId` and never gets a public or signed URL. `POST /api/app/family/receipts` (multipart `file`, up to `FAMILY_RECEIPT_MAX_BYTES`, image signature checked, and one to `FAMILY_RECEIPT_MAX_ENTRIES` `transactionId` fields) adds or replaces it under the same author-or-owner rule as editing the entry. Several ids share one stored object, as for the entries of one scanned receipt; an object is deleted with the last row that uses it. The row has no foreign key to the transaction, so a deleted entry keeps its photo for a restore; the daily maintenance cron removes photos whose entry is gone and outside `FAMILY_RESTORE_DAYS`, and a closed family's purge deletes its objects before its rows.
- A deleted subject has a tombstone checked in the auth middleware on every authenticated path, so a retained token gets `410 account_deleted` instead of a new workspace, including on the routes where tenant resolution is skipped. The resolver keeps its own check; it is the redundant one.
- The `dummy-dev-access-token` shortcut needs `DEV_ACCESS_TOKEN_ENABLED=true` **and** `POSTHOG_AI_ENVIRONMENT` other than `production` **and** a loopback request origin. It is never enabled in a deployed environment, and enabling it is an explicit opt-in rather than a side effect of adding a localhost origin.
- The voice WebSocket authenticates with a single-use 60-second ticket from `POST /api/app/assistant/voice/ticket`, not a JWT. A JWT is accepted only from the `Authorization` header, so nothing puts a bearer token in a URL.

## Related specs

- `docs/architecture.md`, `docs/maintainability.md`, `docs/test-strategy.md`, `docs/deployment.md`
