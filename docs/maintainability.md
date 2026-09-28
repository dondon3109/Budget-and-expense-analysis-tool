# Maintainability boundaries

Zoption keeps the financial authority and synchronization invariants explicit while allowing the
web, Worker, and native clients to evolve independently. Refactors must preserve public facades and
transaction ownership; splitting a file must not split one atomic financial operation.

## Primary ownership areas

| Area           | Owns                                                                                         | Must not own                                                    |
| -------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Web            | Browser workflows, previews, consent UI, authenticated API calls                             | Financial authority, tenant selection, native persistence       |
| Worker and D1  | Authentication enforcement, tenant derivation, financial truth, billing gates, sync protocol | Browser cache state or device-local recovery decisions          |
| Native client  | Encrypted local projections, outbox, explicit conflict resolution, safe workspace recovery   | Direct financial writes to Supabase or server-owned revisions   |
| Shared package | Runtime schemas, money/domain rules, sync wire contracts                                     | Client orchestration, storage connections, provider credentials |

## Synchronization module boundaries

The route-facing server facade remains `apps/api/src/db/mobile-sync.ts`.

- `mobile-sync/protocol.ts` owns opaque cursors, stored-change decoding, atomic page boundaries,
  and canonical server timestamps.
- `mobile-sync/read.ts` owns snapshot sessions, client acknowledgements, and incremental pull.
- `mobile-sync/compaction.ts` owns retention-floor advancement and safe change/tombstone cleanup.
- `mobile-sync/push/` owns push handling:
  - `idempotency.ts`: request hashes, stored results, and replay.
  - `snapshots.ts`: current-row snapshot reads.
  - `rules.ts`: name, reference, and plan checks, plus business rejections.
  - `results.ts`: conflict and rejection results.
  - `graph.ts`: the atomic create dependency graph.
  - `transfer.ts`: the atomic two-leg transfer command.
  - `entities/<entity>.ts`: builds each single-entity mutation as statements and never executes them.
- The facade keeps the `MobileSyncRepository` contract and the push loop, and it owns the single
  `env.DB.batch` that commits an entity mutation with its idempotency row. `graph.ts` and
  `transfer.ts` each own the one batch for their command.

The UI-facing native facade remains
`apps/mobile/src/db/transaction-mutation-repository.ts`.

- `transaction-mutations/model.ts` owns validated row shapes, snapshot encoding, conflict contracts,
  and pure conversion helpers.
- `transaction-mutations/store.ts` owns database lookup and reference validation.
- `transaction-mutations/conflicts.ts` owns conflict inspection and explicit keep-local/keep-server
  resolution.
- `transaction-mutations/outbox.ts` owns graph-safe batching, retry scheduling, permanent failure,
  and server acknowledgement application.
- The facade owns user mutation commands and remains the single public entry point used by screens.

## Critical invariant evidence

| Invariant                            | Required evidence                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Tenant isolation                     | Repository/API tests plus the gated preview two-user flow                             |
| Budget plan scope                    | Zero-limit exclusion tests in the shared dashboard summary and the assistant reader   |
| Integer money and transfer balance   | Shared domain tests and atomic transfer persistence tests                             |
| Local mutation plus outbox atomicity | Mobile SQLite tests using the real mobile migrations                                  |
| Idempotency and revision conflicts   | Server sync repository tests using the complete D1 migration chain                    |
| Replica convergence                  | Two-client create/retry/conflict/pull/delete scenario with final-state equality       |
| Tombstone and retention safety       | Pull, acknowledgement, snapshot, and compaction tests                                 |
| Full recovery safety                 | Generation-building tests proving the old workspace survives every pre-switch failure |

Coverage percentage is not a release target. Critical invariants need realistic evidence, while
provider and presentation seams may remain mocked. API persistence tests should use the shared
SQLite-backed D1 harness and production migrations rather than hand-copied schemas.

### Budget plan scope

A monthly budget row with a zero or missing limit is not a plan. Its category spending still counts
as spending, but it never enters plan totals, remaining budget, utilization, or over-budget state.
Those stay at zero until the user sets a limit, and only then can they go negative. Budget rows are
upsert only and have no delete, so clearing a limit leaves a zero-limit row behind rather than
removing it. Every reader applies the rule: the Worker's `budgetRepository.list`, the shared
`buildDashboardSummary`, the mobile budget month view, the web budget editor's optimistic update,
and the assistant's budget-versus-actual reader.

## Adding an entity

These lists name every file that knows about an entity. The easy ones to miss are the tenant purge, the archive export, and the second write path through mobile sync.

### REST-only entity

1. **Schema:** add a new `db/migrations/NNNN_<name>.sql`, with indexes that start with `tenant_id`, and mirror the table in `db/schema.ts`.
2. **Shared:** add the record type and any enums to `packages/shared/src/types.ts`, and strict request schemas to `packages/shared/src/schemas/<domain>.ts`.
3. **Repository:** create `apps/api/src/db/<entity>.ts`. Every method takes `tenantId`.
4. **Route:** create `apps/api/src/routes/<entity>.ts` with `createXRoutes(repository)`. In `apps/api/src/app.ts`, add the `AppOptions` field, the default, and the mount.
5. **Account lifecycle:**
   - Purge the table in `apps/api/src/db/account-deletion.ts`.
   - Include its rows in `apps/api/src/exports/archive.ts`.
6. **Assistant (optional):** to expose the entity to the assistant, add a reader in `apps/api/src/assistant/financial-reader.ts` and a tool in `apps/api/src/assistant/tools.ts`.
7. **Web:**
   - A call in `apps/web/src/lib/api.ts`.
   - A key in `apps/web/src/lib/queryKeys.ts`.
   - The page and its route.
8. **Tests:**
   - Repository tests in `apps/api/tests/` on `createD1TestDatabase`.
   - Route coverage.
   - Web page tests.

### Synced entity

Do everything in the REST list above, then add these steps:

1. **Sync contract:** in `packages/shared/src/sync.ts`, add the entity type, the input, update, and snapshot schemas, and use the money caps from `packages/shared/src/limits.ts` rather than new literals.
2. **Server schema:** a migration adds the `revision` column and the change-log triggers. Copy `db/migrations/0039_mobile_sync_goals.sql`.
3. **Server sync:** add the snapshot reader, business rejection, and push mutation in `apps/api/src/db/mobile-sync.ts`. Pull and snapshot in `apps/api/src/db/mobile-sync/read.ts` are generic over the change log. Edit read.ts only if the new entity must be applied before others: it orders accounts and categories first.
4. **Mobile schema:** add a local table in `apps/mobile/src/db/migrations.ts`. It is append-only, so add the entry and bump `LOCAL_SCHEMA_VERSION`.
5. **Mobile sync:**
   - Add the entity-to-table map entries in `apps/mobile/src/db/sync-repository.ts` and `apps/mobile/src/db/transaction-mutations/model.ts`.
   - Add an `applyX` function in `sync-repository.ts`.
6. **Mobile write:**
   - Create, update, and delete commands in `apps/mobile/src/db/transaction-mutation-repository.ts`. Each command writes the row and its outbox entry in one transaction.
   - Conflict inspection and resolution in `apps/mobile/src/db/transaction-mutations/conflicts.ts`.
7. **Mobile read:** a query in `apps/mobile/src/db/repository.ts` and a hook in `apps/mobile/src/db/local-workspace-state.tsx`.
8. **Mobile UI:** screens in `apps/mobile/src/features/<area>/`, including a conflict screen, with one-line routes in `apps/mobile/app/`.
9. **Rollout:** installed apps validate pull responses strictly. A new entity type or payload field needs a client release that understands it before the server sends it (`apps/api/AGENTS.md`). Document the protocol change in `docs/mobile/sync-protocol.md`.
10. **Tests:**
    - Server sync tests in `apps/api/tests/mobile-sync.test.ts`, which run the full D1 migration chain.
    - Mobile repository tests with the real local migrations.

## Change rules for one maintainer

1. Keep the route/UI-facing facades stable while extracting one responsibility at a time.
2. Add no repository method that spans an entity row and outbox without one clear transaction owner.
3. Prefer a focused invariant test over broad duplicate regression tests.
4. Treat a new provider, deployment channel, or synchronized entity as ongoing operational scope,
   not only an implementation task.
5. Before adding a major optional subsystem, either retire/freeze existing optional scope or record
   the user value and operational owner that justify it.
6. Review the optional-system flags below during planning; flags never authorize deletion or
   production configuration changes by themselves.

See [optional-system flags](optional-systems-review.md) and [test strategy](test-strategy.md).
