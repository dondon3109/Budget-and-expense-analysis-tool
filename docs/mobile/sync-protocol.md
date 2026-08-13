# Mobile synchronization protocol

Status: Milestone 4 implementation in progress. The isolated branch implements versioned contracts,
D1 revision/change foundations, and authenticated read-only pull. Push and mobile application remain
unimplemented. The current production API and D1 have not been changed.

## Goals and invariants

- Preserve tenant isolation and Worker-side authority.
- Accept durable offline changes without device-clock conflict rules.
- Make retrying the same operation safe.
- Converge web and multiple mobile devices without silent data loss.
- Apply each transfer and import commit atomically.
- Keep deleted rows discoverable until every active client can advance past their tombstones.

## Server data model additions

Each syncable row gains a server-owned integer `revision`, `created_at`, `updated_at`, and nullable deletion metadata. D1 maintains a tenant-scoped monotonic change sequence; every committed row change appends one change-log entry with `sequence`, entity type, entity ID, row revision, operation, and server timestamp.

The sequence is monotonic within a tenant, not global. Clients treat it as an opaque cursor and never compare device timestamps.

The Worker maintains tenant-scoped idempotency records keyed by `(tenant_id, client_id, idempotency_key)`, including a canonical request hash and the prior result. Reuse with a different payload is rejected.

The local implementation names these tables `mobile_sync_state`, `mobile_sync_changes`, and
`mobile_sync_idempotency`. D1 triggers add existing web/API account, category, and transaction writes
to the same change stream. Migration bootstrap changes are ordered by entity type and ID within each
tenant so an existing workspace can start from cursor zero.

## Client identifiers

- `client_id`: random installation/workspace UUID stored with the encrypted local workspace, not used for authorization.
- Entity IDs: UUIDv4 generated before the local write.
- `operation_id`: UUIDv4 primary key for one outbox entry.
- `idempotency_key`: stable UUID for the logical server mutation; unchanged across retries.
- `base_revision`: last acknowledged server revision the mutation was composed against, or `0` for create.

The Worker derives the tenant from the verified Supabase subject. A tenant ID in a request body is rejected by strict schemas.

## Local transaction

An approved offline mutation uses one SQLCipher transaction:

1. Validate the command and referenced local rows.
2. Write the optimistic entity projection with `sync_state = pending`.
3. Write the encrypted outbox operation and explicit dependencies.
4. Commit.
5. Notify observers only after commit succeeds.

A process kill before commit changes nothing; a kill after commit leaves enough state to resume.

## Push

`POST /api/app/sync/push` accepts a bounded ordered batch. Operations include entity, command, entity UUID, base revision, idempotency key, dependencies, and a strictly validated command payload. The Worker:

1. Authenticates and derives the tenant.
2. Resolves prior idempotent results.
3. Validates dependency order, plan, ownership, references, monetary invariants, and rate limits.
4. Compares `base_revision` with the current row revision.
5. Applies safe operations in a D1 transaction and assigns revisions/change sequences/server timestamps.
6. Returns one result per operation: acknowledged, conflict, retryable rejection, or permanent rejection.

The first implementation should use atomic batches for one dependency graph. It must not acknowledge a dependent child if its parent failed. A transfer is one command whose two legs and change-log entries commit in one D1 transaction.

## Pull

`POST /api/app/sync/pull` accepts the last opaque tenant cursor and a bounded limit. The Worker returns an ordered change batch, row payloads or tombstones, and `next_cursor`. The next cursor advances only after the mobile client applies the entire batch in one local transaction.

An unknown/expired cursor returns a typed `full_resync_required` response. Full resync builds a new encrypted generation beside the current database, verifies it, then atomically switches generations; it never clears the only readable local copy first.

Protocol version 1 encodes the tenant-local integer sequence as a canonical opaque `v1.<base36>`
cursor. Pull is bounded to 200 changes and reads one extra row to report `hasMore` without claiming
completion. The current implementation detects an ahead-of-server cursor; retention-based expiry and
full-resync generation switching remain pending.

## Conflict policy

- Create with a previously unseen UUID succeeds if references and plan allow it.
- Identical idempotency retry returns the stored result.
- Update/delete with the current base revision succeeds.
- Update/delete with a stale base revision is a conflict unless a field-level merge is proven safe.
- Financial amount, kind, date, accounts, category, transfer fee, or deletion conflicts are never last-write-wins.
- A conflict record stores the local proposed command, the acknowledged base snapshot, and the current server snapshot. The visible entity stays explicitly conflicted until the user chooses a resolution.
- Resolution is a new operation based on the current server revision. “Keep mine” is never an unversioned overwrite.

Account/category display metadata may later gain explicit field-level merge rules, but no automatic merge is part of the first vertical slice.

## Deletions

Deletes create server tombstones with a new revision and sequence. Clients retain local tombstones until the server cursor proves the delete is acknowledged. Server tombstones are retained for a documented window longer than the maximum supported offline period, or until a per-client acknowledgement strategy permits safe compaction.

## Retry classification

| Result                                            | Client behavior                                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Network failure, timeout, `429`, `5xx`            | Retry with bounded exponential backoff and full jitter; retain operation                                    |
| `401` expired token                               | Pause batch, refresh once, then retry; require sign-in if refresh fails                                     |
| `403` plan limit                                  | Permanent rejection with upgrade/edit/discard action; do not retry unchanged                                |
| Invalid/archived category or account              | Permanent blocked operation; let user repair reference                                                      |
| `409` stale revision or duplicate semantic import | Materialize conflict/duplicate state; no blind retry                                                        |
| `410 account_deleted`                             | Freeze workspace, prevent new writes, enter deletion recovery/cleanup flow                                  |
| Schema/invariant failure                          | Permanent rejection; preserve command for user-visible repair/support diagnostics without sensitive logging |

Backoff is persisted per outbox row. Foreground sync may run immediately; background sync is opportunistic and interruptible.

## Web/mobile convergence

Existing web CRUD writes must also increment row revisions and append the same tenant change log inside their D1 transactions before mobile sync can be released. The web client does not need an outbox initially, but its server mutations participate in the same concurrency model.

## Imports

File parsing and preview remain non-mutating. Confirmed commit is an online atomic server operation. A commit token and tenant-scoped idempotency key prevent retry duplication; transaction fingerprints remain the semantic duplicate constraint. Imported rows enter the change log in the same atomic commit.

## Verification scenarios

- Kill after local entity write attempt but before transaction commit.
- Kill after local commit and before first push.
- Lose the response after server commit, then retry the same idempotency key.
- Edit the same transaction on web and two mobile devices from the same base revision.
- Delete a category while an offline transaction references it.
- Exceed a Free limit while offline, then reconnect.
- Interrupt a multi-page pull before local cursor commit.
- Transfer push failure at every statement boundary.
- Duplicate import commit after response loss.
- Sign out or switch subjects with pending/conflicted operations.
