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
- The facade continues to compose push handling behind the unchanged `MobileSyncRepository` contract.

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
