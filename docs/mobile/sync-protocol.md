# Mobile synchronization protocol

Status: Milestone 4 implementation in progress. The isolated branch implements versioned contracts,
D1 revision/change foundations, authenticated pull, and atomic encrypted mobile pull application for
accounts, categories, transactions, and tombstones. The end-to-end push slice supports account and
category create/update/archive, non-transfer transaction create/update/delete, and atomic transfer
create/update/delete, including local
composition, restart replay, acknowledgement, retry, conflict preservation, and atomic creation of
new references with their dependent transaction. The current production API and D1 have not changed.

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
tenant so an existing workspace can start from cursor zero. Migration
`0036_mobile_sync_atomic_transfers.sql` adds immutable transfer-group membership and maps the two
change sequences produced by each transfer revision into one atomic pull group. Existing valid
linked pairs are bootstrapped into both structures.

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

The implemented transaction repository shares one serialized writer with pull application. One active
outbox row is allowed per entity. A pending, never-attempted operation may be coalesced; once marked
`sending` or attempted, its payload and idempotency key are immutable. A process restart therefore
replays the exact saved request instead of mutating a key underneath an uncertain server result.
New account and category creates may be selected immediately for a new transaction. The transaction
outbox row records the exact parent operation IDs, and a parent cannot be cancelled while that child
exists. The batch selector treats the connected component as one unit: it neither splits the graph nor
mixes it with unrelated operations.

A transfer is represented locally by two transaction rows and exactly one `transfer` outbox entity.
Create, full-command edit, delete, acknowledgement, failure, and conflict-state changes always touch
both rows in the same SQLCipher transaction. Transfer commands initially require synchronized active
accounts and a synchronized available transfer category; they do not join new-reference dependency
graphs in protocol version 1.

## Push

`POST /api/app/sync/push` accepts a bounded ordered batch. Operations include entity, command, entity UUID, base revision, idempotency key, dependencies, and a strictly validated command payload. The Worker:

1. Authenticates and derives the tenant.
2. Resolves prior idempotent results.
3. Validates dependency order, plan, ownership, references, monetary invariants, and rate limits.
4. Compares `base_revision` with the current row revision.
5. Applies safe operations in a D1 transaction and assigns revisions/change sequences/server timestamps.
6. Returns one result per operation: acknowledged, conflict, retryable rejection, or permanent rejection.

The first implementation should use atomic batches for one dependency graph. It must not acknowledge a dependent child if its parent failed. A transfer is one command whose two legs and change-log entries commit in one D1 transaction.

The implemented server slice accepts dependency-free account, category, and non-transfer transaction
operations. Client-generated UUID creation, exact-base-revision updates/deletes, the D1 mutation,
trigger-generated change row, and tenant/client/idempotency acknowledgement commit in one D1 batch.
Retrying the same key and canonical operation returns its stored result; using that key for different
content is a conflict. Concurrent loss of the expected revision returns the current validated server
snapshot instead of overwriting it.

Account and category `delete` commands preserve the existing product behavior: they archive the row
and emit a revisioned upsert rather than hard-delete user-visible metadata. Permanent system rows,
case-insensitive name uniqueness, category restore rules, and the current Free/Pro custom-category
allowance remain server-authoritative.

The Worker also accepts one connected create graph containing new account/category roots and dependent
non-transfer transactions. Dependencies must reference earlier operations and exactly match the new
references used by each transaction. All names, entitlements, existing references, category kinds,
and projected Free-plan limits are preflighted. Success executes every mutation and idempotency
acknowledgement in one guarded D1 batch; any zero-row conditional mutation aborts and rolls back the
whole graph. A preflight rejection persists one deterministic result set: the failing operation keeps
its specific code and every otherwise-valid operation receives `dependency_failed`. Replaying the
whole graph returns the stored results, while a partial replay or reused key fails closed.

Atomic transfer commands use the transfer-group UUID as their logical entity ID and client-generated
UUIDs for both ledger rows. The Worker validates both accounts, the transfer category, fee invariants,
plan access, ownership, idempotency, and the common base revision before executing the group claim,
both legs, and acknowledgement in one guarded D1 batch. Updates and deletes condition the second leg
on the first leg's success; any missing or stale leg makes the final acknowledgement fail and D1 rolls
back the whole batch. Conflicts return one validated logical transfer snapshot instead of selecting a
leg as authoritative.

The mobile coordinator drains up to 100 bounded operation batches before pull, refreshes an expired
session once, and applies each response on the keyed database connection. Acknowledgements remove the
outbox row only while updating the local server revision in the same transaction. Network and timeout
failures persist exponential full-jitter retry metadata; permanent rejections remain failed and
visible. A conflict writes the acknowledged base, local command, and current server snapshot before
marking the entity conflicted. The foreground coordinator schedules the earliest persisted retry and
cannot report `synced` while any outbox operation remains outstanding.

## Pull

`POST /api/app/sync/pull` accepts the last opaque tenant cursor and a bounded limit. The Worker returns an ordered change batch, row payloads or tombstones, and `next_cursor`. The next cursor advances only after the mobile client applies the entire batch in one local transaction.

An unknown/expired cursor returns a typed `full_resync_required` response. Full resync builds a new encrypted generation beside the current database, verifies it, then atomically switches generations; it never clears the only readable local copy first.

Protocol version 1 encodes the tenant-local integer sequence as a canonical opaque `v1.<base36>`
cursor. Pull is bounded to 200 changes and reads one extra row to report `hasMore` without claiming
completion. The Worker now rejects cursors below its retained floor. After the final page commits, the
mobile client acknowledges the exact encrypted-workspace client UUID and committed cursor; cursor
regression and acknowledgements outside the retained window fail closed.

The Worker also exposes a client-bound, one-day resumable full snapshot at a fixed server sequence.
Snapshot pages contain each entity's latest live version in dependency order, preserve atomic transfer
pairs, and return the incremental cursor from which normal pull resumes. Daily compaction expires
inactive clients after the documented 90-day offline window and removes only old changes that every
active client acknowledged; it pauses while a snapshot session is active and retains each latest live
row. The mobile beside-the-current-database generation builder, verification, and atomic switch remain
pending, so the app continues to surface `full-resync-required` without deleting its readable copy.

Each transfer revision assigns the same atomic-group token to its two adjacent change rows. Pull never
cuts that pair: a limit of one still returns both legs when the pair is first, while a pair that would
overflow a non-empty page starts the next page. A cursor inside a pair or malformed group fails closed
with `full_resync_required`. The shared response remains bounded to 200 changes.

The mobile transport uses the fixed pull path, caps decoded response size, and validates the shared
schema before persistence. Each page and its cursor commit on the keyed SQLCipher connection in one
transaction. A process interruption therefore leaves either the prior page/cursor or the complete new
page/cursor. Tombstones remain even when the deleted row was never present locally. Server revisions
older than the local durable revision are ignored; any server change overlapping a pending, failed, or
conflicted local row stops with `local_conflict` and does not advance the cursor.

Foreground pulls are bounded by page count and per-request timeout. An expired token is refreshed
once. NetInfo can delay an attempt but only the Worker response and local commit produce `synced`.
Startup opens the immutable-subject-scoped local workspace without waiting for Worker availability;
the independent Worker identity assertion gates synchronization, not offline reads.

## Conflict policy

- Create with a previously unseen UUID succeeds if references and plan allow it.
- Identical idempotency retry returns the stored result.
- Update/delete with the current base revision succeeds.
- Update/delete with a stale base revision is a conflict unless a field-level merge is proven safe.
- Financial amount, kind, date, accounts, category, transfer fee, or deletion conflicts are never last-write-wins.
- A conflict record stores the local proposed command, the acknowledged base snapshot, and the current server snapshot. The visible entity stays explicitly conflicted until the user chooses a resolution.
- Resolution is a new operation based on the current server revision. “Keep mine” is never an unversioned overwrite.

The implemented transaction, transfer, account, and category reviews present the preserved device and server
versions. `keep_server` applies the validated server snapshot and closes the conflicted outbox row
atomically. `keep_local` closes the old operation, creates a fresh idempotency key, and queues a full
update using the preserved server revision as its base. If the server changed again first, that new
operation conflicts again instead of overwriting it. Account/category metadata has no automatic
field-level merge in this first vertical slice.

## Deletions

Deletes create server tombstones with a new revision and sequence. Clients retain local tombstones until the server cursor proves the delete is acknowledged. The server retains changes for the 90-day supported offline window and compacts acknowledged tombstones only after every active client advances beyond them; a later full snapshot represents the deleted row by its absence.

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
