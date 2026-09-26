# apps/api

## Overview

The Cloudflare Worker that owns authentication enforcement, tenant data, and financial truth for Zoption. It is a Hono app that verifies the Supabase token on every private request, resolves the caller's D1 tenant, and serves the `/api/app/*` surface used by the browser and the native clients.

## Stack

- **Language / Runtime**: TypeScript on Cloudflare Workers
- **Framework**: Hono
- **Data**: Cloudflare D1 (SQLite) through hand written `env.DB.prepare` and `env.DB.batch`; the repo root Drizzle file `../../db/schema.ts` describes the tables but runs no queries
- **Key dependencies**: `@zoption/shared` for zod schemas, Wrangler for dev and deploy
- **Tests**: Vitest, run from the repo root through the root `vitest.config.ts`

## Key files

| File                    | Owns                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| `src/index.ts`          | Worker entry: `fetch`, `queue`, `scheduled`, and the rate limit Durable Object |
| `src/app.ts`            | `createApp` factory: middleware, binding checks, route mounts, error handling  |
| `src/auth.ts`           | Supabase JWT verification against the project JWKS                             |
| `src/readiness.ts`      | Required binding validation for `/health`, the queue, and the cron entries     |
| `src/db/`               | One repository object per entity, every method scoped by `tenantId`            |
| `src/db/mobile-sync.ts` | Route facing sync facade; protocol, read, and compaction sit beside it         |
| `src/routes/`           | Hono route modules, one per surface, mounted in `src/app.ts`                   |
| `../../db/migrations/`  | Forward only SQL migrations that Wrangler applies in file name order           |

## Commands

```bash
pnpm --filter @zoption/api dev        # wrangler dev on 127.0.0.1:8787
pnpm --filter @zoption/api dev:lan    # wrangler dev on 0.0.0.0:8787, for device testing over Wi-Fi
pnpm --filter @zoption/api build      # wrangler deploy --dry-run
pnpm --filter @zoption/api typecheck
pnpm test                             # from the repo root; there is no api level vitest config
pnpm db:migrate:local                 # apply db/migrations to the local D1 database
```

## Conventions

- Route modules export `createXRoutes(dependency)` and are mounted centrally in `src/app.ts`. Do not import a repository inside a route; pass it through the factory.
- Validate at the boundary with a `@zoption/shared` zod schema through `parseInput(schema, value, <message>)` in `src/request.ts`, which answers `400 invalid_request` with the flattened field errors. Bodies go through `readJson`, path ids through `parsePathParameter`. Call `safeParse` directly only when a failure needs a different status, code, or detail.
- Only `HttpError` carries a client visible message. An unexpected failure is logged as one structured JSON line and returned as a bare `500 internal_server_error`.
- Every repository method takes `tenantId`. Handlers read it from `context.get("tenant").tenantId` and never from request input.
- Tables use snake_case columns; TypeScript fields are camelCase.
- Tests live flat in `apps/api/tests/`, named in kebab case, with shared helpers under `tests/helpers/`. Repository tests build their database with `createD1TestDatabase`.

## Gotchas

- Migrations run in file name order, so two files sharing a prefix sort by the rest of the name (`0034_mobile_sync_foundation.sql` before `0034_receipt_consent.sql`). Renaming a migration silently changes the order.
- A migration must work with the Worker version already deployed. `Production Release` applies migrations before it deploys the new Worker, so the old code serves traffic against the new schema for the length of the deploy, and indefinitely if the deploy step fails or the Worker is rolled back. Add columns and tables first, stop reading an old one in a later release, and drop it only after that. The table rebuild pattern (create, copy, drop, rename) is fine when the rebuilt table keeps every column the deployed code reads.
- Drizzle metadata is stale on purpose: `../../db/migrations/meta/` stops at `0015`, so `pnpm db:generate` would emit one migration covering everything since then. Write new migrations by hand.
- Never insert into a view in tests. `effective_pro_access` (the Worker's entitlement view, including trials) and `effective_pro_entitlements` are recreated by migrations; seed the base tables instead.
- Do not add fields to a mobile sync payload without an agreed client capability. Installed apps validate the whole pull response strictly and reject an unknown key. A data backfill migration must bump `revision`.
- Money is integer centavos end to end (`amount_minor`). Expenses are negative, transfers count once, and assistant output must never show centavos or a peso symbol.
- Tenant resolution is skipped for `DELETE /api/app/account` and `/api/app/admin/*`; `context.get("tenant")` is unset on those paths.
- A deleted subject has a tombstone checked in the auth middleware on every authenticated path, so a retained token gets `410 account_deleted` instead of a new workspace, including on the routes where tenant resolution is skipped. The resolver keeps its own check; it is the redundant one.
- The `dummy-dev-access-token` shortcut needs `DEV_ACCESS_TOKEN_ENABLED=true` **and** `POSTHOG_AI_ENVIRONMENT` other than `production` **and** a loopback request origin. It is never enabled in a deployed environment, and enabling it is an explicit opt-in rather than a side effect of adding a localhost origin.
- The voice WebSocket authenticates with a single-use 60-second ticket from `POST /api/app/assistant/voice/ticket`, not a JWT. A JWT is accepted only from the `Authorization` header, so nothing puts a bearer token in a URL.

## Related specs

- `docs/architecture.md`, `docs/maintainability.md`, `docs/test-strategy.md`, `docs/deployment.md`
