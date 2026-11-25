import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { snapshotMobileSync } from "@/api/mobile-sync";
import { markStartupPhase } from "@/diagnostics/startup-timing";
import { isDummyDevelopmentSubject, seedDummyWorkspaceData } from "./demo-seed";
import { isGuestSubject, seedGuestWorkspace } from "./guest-workspace";
import {
  getOrCreateWorkspaceKey,
  getWorkspaceGeneration,
  removeWorkspaceGeneration,
  removeWorkspaceKey,
  setWorkspaceGeneration,
  workspaceAlias,
} from "./key-store";
import { ensureLocalDataBackupProtection } from "./local-data-security";
import { applyLocalMigrations, asMigrationDatabase } from "./migrations";
import { LocalWorkspaceRepository } from "./repository";
import { LocalSyncRepository } from "./sync-repository";
import { LocalDatabaseWriter } from "./database-writer";
import { LocalTransactionMutationRepository } from "./transaction-mutation-repository";
import {
  databaseNameForGeneration,
  streamSnapshotPages,
  verifySnapshotGeneration,
  type SnapshotPageFetcher,
  type SnapshotStreamResult,
} from "./workspace-generation";

interface CipherVersionRow {
  cipher_version?: string;
}

interface WorkspaceMetadataRow {
  value: string;
}

export class LocalWorkspaceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalWorkspaceError";
  }
}

function developmentDetail(error: unknown): string {
  return __DEV__ && error instanceof Error ? ` ${error.message}` : "";
}

export interface LocalWorkspace {
  database: SQLiteDatabase;
  databaseName: string;
  repository: LocalWorkspaceRepository;
  syncRepository: LocalSyncRepository;
  transactionMutations: LocalTransactionMutationRepository;
  schemaVersion: number;
  generation: number;
  /** True once this local workspace has finished an initial sync, or never syncs with the server. */
  hasSynced: boolean;
  /** True once `database` has been closed and must not be reused by readers or subsequent opens. */
  closed?: boolean;
}

export interface LocalWorkspaceSignOutRisk {
  unsyncedOperationCount: number;
  unresolvedConflictCount: number;
}

async function configureEncryptedDatabase(database: SQLiteDatabase, key: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("The local workspace key is invalid.");
  // The key is generated locally and restricted to lowercase hex, so it is safe to
  // embed as the SQLCipher passphrase before any other database access occurs.
  await database.execAsync(`PRAGMA key = '${key}'`);
  const cipher = await database.getFirstAsync<CipherVersionRow>("PRAGMA cipher_version");
  if (!cipher?.cipher_version) {
    throw new Error("SQLCipher is unavailable in this development build.");
  }
  try {
    await database.getFirstAsync("SELECT count(*) AS count FROM sqlite_master");
  } catch (error) {
    throw new LocalWorkspaceError(
      "The protected key could not unlock this local workspace. Zoption preserved it for recovery.",
      { cause: error },
    );
  }
  await database.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA secure_delete = ON;
    PRAGMA busy_timeout = 5000;
  `);
}

async function assertWorkspaceSubject(database: SQLiteDatabase, subject: string): Promise<void> {
  const current = await database.getFirstAsync<WorkspaceMetadataRow>(
    "SELECT value FROM workspace_metadata WHERE key = 'supabase_subject'",
  );
  if (current && current.value !== subject) {
    throw new Error("The encrypted workspace belongs to a different identity.");
  }
  if (!current) {
    await database.runAsync(
      "INSERT INTO workspace_metadata (key, value) VALUES ('supabase_subject', ?)",
      subject,
    );
  }
}

interface OpenWorkspaceEntry {
  workspace: LocalWorkspace;
  leases: Set<symbol>;
}

const openWorkspaces = new Map<string, OpenWorkspaceEntry>();
const subjectQueues = new Map<string, Promise<void>>();
// Tri-state cache: undefined = not yet checked since launch, false = known clean, true = dirty.
const workspaceSyncDirty = new Map<string, boolean>();

function serializeForSubject<T>(subject: string, task: () => Promise<T>): Promise<T> {
  const prior = subjectQueues.get(subject) ?? Promise.resolve();
  const next = prior.then(task, task);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  const tracked = tail.finally(() => {
    if (subjectQueues.get(subject) === tracked) {
      subjectQueues.delete(subject);
    }
  });
  subjectQueues.set(subject, tracked);
  return next;
}

/**
 * Tri-state sync dirty cache for `subject`: `undefined` until checked or opened on this launch,
 * `false` when known clean (no pending outbox, unresolved conflicts, or queued receipt uploads),
 * and `true` when local sync work may need draining.
 */
export function isWorkspaceSyncDirty(subject: string): boolean | undefined {
  return workspaceSyncDirty.get(subject);
}

export function markWorkspaceSyncDirty(subject: string, dirty: boolean): void {
  workspaceSyncDirty.set(subject, dirty);
}

async function closeWorkspaceEntry(subject: string): Promise<void> {
  const closing = openWorkspaces.get(subject);
  if (!closing) return;
  openWorkspaces.delete(subject);
  const alreadyClosed = closing.workspace.closed === true;
  closing.workspace.closed = true;
  if (alreadyClosed) {
    await closing.workspace.database.closeAsync().catch(() => undefined);
  } else {
    await closing.workspace.database.closeAsync();
  }
}

async function openWorkspaceInternal(subject: string, lease?: symbol): Promise<LocalWorkspace> {
  const existing = openWorkspaces.get(subject);
  if (existing && !existing.workspace.closed) {
    if (lease) existing.leases.add(lease);
    return existing.workspace;
  }
  await closeWorkspaceEntry(subject);
  const workspace = await openWorkspaceFile(subject);
  openWorkspaces.set(subject, {
    workspace,
    leases: new Set(lease ? [lease] : []),
  });
  return workspace;
}

/**
 * Whether an opened workspace already has a usable local copy and should open immediately instead
 * of holding behind the first-sync loading screen. Never blocks a phone with unsynced local work.
 */
export function resolveWorkspaceHasSynced(state: {
  localOnly: boolean;
  generation: number;
  serverCursor: string | null;
  serverAcknowledgedCursor: string | null;
  outboxCount: number;
}): boolean {
  if (state.localOnly) return true;
  if (state.serverAcknowledgedCursor) return true;
  if (state.generation > 1 && state.serverCursor) return true;
  return state.outboxCount > 0;
}

async function openWorkspaceFile(subject: string): Promise<LocalWorkspace> {
  const alias = await workspaceAlias(subject);
  const [generation, key] = await Promise.all([
    getWorkspaceGeneration(alias),
    getOrCreateWorkspaceKey(alias),
    ensureLocalDataBackupProtection(),
  ]);
  const name = databaseNameForGeneration(alias, generation);
  markStartupPhase("workspace:key");
  const database = await openDatabaseAsync(name, {
    enableChangeListener: true,
    useNewConnection: true,
  });
  try {
    // Between `workspace:key` and here sit the SQLCipher key derivation and
    // the first page read, which is the part of the unlock we cannot see.
    await configureEncryptedDatabase(database, key);
    markStartupPhase("workspace:opened");
    let schemaVersion: number;
    try {
      schemaVersion = await applyLocalMigrations(asMigrationDatabase(database));
      markStartupPhase("workspace:migrations");
      await assertWorkspaceSubject(database, subject);
      if (isDummyDevelopmentSubject(subject)) {
        const existing = await database.getFirstAsync<{ count: number }>(
          "SELECT count(*) AS count FROM accounts WHERE deleted_at IS NULL",
        );
        if ((existing?.count ?? 0) === 0) {
          await seedDummyWorkspaceData(database);
        }
      }
      if (isGuestSubject(subject)) {
        const existing = await database.getFirstAsync<{ count: number }>(
          "SELECT count(*) AS count FROM accounts",
        );
        if ((existing?.count ?? 0) === 0) await seedGuestWorkspace(database);
      }
    } catch (error) {
      throw new LocalWorkspaceError(
        `The encrypted workspace migration did not complete. Zoption preserved it for recovery.${developmentDetail(error)}`,
        { cause: error },
      );
    }
    const localOnly = isDummyDevelopmentSubject(subject) || isGuestSubject(subject);
    const syncRow = localOnly
      ? null
      : await database.getFirstAsync<{
          server_cursor: string | null;
          server_acknowledged_cursor: string | null;
          outbox_count: number;
          has_pending_work: number;
        }>(
          `SELECT
             server_cursor,
             server_acknowledged_cursor,
             (SELECT count(*) FROM sync_outbox) AS outbox_count,
             (
               EXISTS(
                 SELECT 1 FROM sync_outbox
                 WHERE state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted')
               )
               OR EXISTS(SELECT 1 FROM sync_conflicts WHERE resolved_at IS NULL)
               OR EXISTS(SELECT 1 FROM receipt_uploads)
             ) AS has_pending_work
           FROM sync_metadata
           WHERE singleton = 1`,
        );
    markWorkspaceSyncDirty(subject, localOnly ? false : Boolean(syncRow?.has_pending_work));
    const hasSynced = resolveWorkspaceHasSynced({
      localOnly,
      generation,
      serverCursor: syncRow?.server_cursor ?? null,
      serverAcknowledgedCursor: syncRow?.server_acknowledged_cursor ?? null,
      outboxCount: syncRow?.outbox_count ?? 0,
    });
    const writer = new LocalDatabaseWriter();
    const workspace = {
      database,
      databaseName: name,
      repository: new LocalWorkspaceRepository(database),
      syncRepository: new LocalSyncRepository(database, writer, name),
      transactionMutations: new LocalTransactionMutationRepository(
        database,
        writer,
        undefined,
        undefined,
        undefined,
        name,
        (dirty) => markWorkspaceSyncDirty(subject, dirty),
      ),
      schemaVersion,
      generation,
      hasSynced,
      closed: false,
    };
    return workspace;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

/**
 * Opens or reuses the encrypted workspace for `subject`. Passing a per-mount `lease` keeps the
 * shared handle open while overlapping mounts (such as Android OAuth deep-link handoff) settle.
 */
export function openLocalWorkspace(subject: string, lease?: symbol): Promise<LocalWorkspace> {
  return serializeForSubject(subject, () => openWorkspaceInternal(subject, lease));
}

/**
 * Runs `task` on the workspace file for `subject` without making it the open one: an already-open
 * workspace for `subject` is reused as is, and any other file gets its own connection, closed
 * afterwards. Operations on different subjects do not block each other.
 */
export function withDetachedWorkspace<T>(
  subject: string,
  task: (workspace: LocalWorkspace) => Promise<T>,
): Promise<T> {
  return serializeForSubject(subject, async () => {
    const existing = openWorkspaces.get(subject);
    if (existing && !existing.workspace.closed) return task(existing.workspace);
    const workspace = await openWorkspaceFile(subject);
    try {
      return await task(workspace);
    } finally {
      workspace.closed = true;
      await workspace.database.closeAsync().catch(() => undefined);
    }
  });
}

const CORRUPT_DATABASE_PATTERN =
  /SQLITE_CORRUPT|SQLITE_NOTADB|file is not a database|malformed database|database disk image is malformed/iu;

/**
 * Turns a native open failure into safe user copy. Corrupted or non-database
 * files get the recovery guidance instead of a raw SQLite message, and raw
 * error text is never surfaced verbatim (it can contain paths or key material).
 */
export function describeWorkspaceOpenFailure(error: unknown): string {
  if (error instanceof Error && CORRUPT_DATABASE_PATTERN.test(error.message)) {
    return (
      "The encrypted local data on this device is damaged. It can be safely replaced " +
      "the next time you sign in; records already synchronized remain in your Zoption workspace."
    );
  }
  return "The encrypted local workspace could not be opened on this device.";
}

/**
 * Streams all snapshot pages directly into `syncRepository` page-by-page and records the resumed
 * incremental cursor on completion. Suitable for both staging recovery and initial snapshot sync.
 */
export async function fetchAndApplySnapshot({
  syncRepository,
  fetchPage,
  maxPages,
  expectedServerCursor,
}: {
  syncRepository: Pick<LocalSyncRepository, "applySnapshotPage" | "recordSnapshotCompletion">;
  fetchPage: SnapshotPageFetcher;
  maxPages?: number;
  expectedServerCursor?: string | null;
}): Promise<SnapshotStreamResult> {
  const result = await streamSnapshotPages(
    fetchPage,
    (changes) => syncRepository.applySnapshotPage(changes),
    { maxPages, expectedServerCursor },
  );
  await syncRepository.recordSnapshotCompletion(result.resumeCursor);
  return result;
}

async function buildSnapshotGeneration({
  databaseName: name,
  key,
  subject,
  clientId,
  fetchPage,
  expectedServerCursor,
}: {
  databaseName: string;
  key: string;
  subject: string;
  clientId: string;
  fetchPage: SnapshotPageFetcher;
  expectedServerCursor?: string | null;
}): Promise<void> {
  // Remove any leftover staging file from an interrupted earlier recovery before opening.
  await deleteDatabaseAsync(name).catch(() => undefined);
  const database = await openDatabaseAsync(name, { useNewConnection: true });
  try {
    await configureEncryptedDatabase(database, key);
    // Staging is invisible until the generation pointer flips, so NORMAL avoids per-page fsyncs.
    await database.execAsync("PRAGMA synchronous = NORMAL;");
    await applyLocalMigrations(asMigrationDatabase(database));
    await database.runAsync(
      "INSERT INTO workspace_metadata (key, value) VALUES ('supabase_subject', ?)",
      subject,
    );
    await database.runAsync(
      "INSERT INTO workspace_metadata (key, value) VALUES ('mobile_client_id', ?)",
      clientId,
    );
    const syncRepository = new LocalSyncRepository(database);
    const result = await fetchAndApplySnapshot({
      syncRepository,
      fetchPage,
      expectedServerCursor,
    });
    await database.execAsync("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA synchronous = FULL;");
    await verifySnapshotGeneration(database, subject, clientId, result.resumeCursor);
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    await deleteDatabaseAsync(name).catch(() => undefined);
    throw error;
  }
  await database.closeAsync();
}

/**
 * Rebuilds the workspace file for `subject` from a server snapshot and switches to it, dropping
 * anything not yet uploaded. `workspaceId` names the family the file belongs to, if any.
 */
export function recoverLocalWorkspace(
  subject: string,
  accessToken: string,
  workspaceId: string | null = null,
): Promise<void> {
  return serializeForSubject(subject, async () => {
    const alias = await workspaceAlias(subject);
    const key = await getOrCreateWorkspaceKey(alias);
    const currentGeneration = await getWorkspaceGeneration(alias);
    const nextGeneration = currentGeneration + 1;
    const name = databaseNameForGeneration(alias, nextGeneration);

    const existing = openWorkspaces.get(subject);
    let clientId: string;
    if (existing && !existing.workspace.closed) {
      clientId = await existing.workspace.transactionMutations.clientId();
    } else {
      const temporary = await openWorkspaceFile(subject);
      try {
        clientId = await temporary.transactionMutations.clientId();
      } finally {
        temporary.closed = true;
        await temporary.database.closeAsync().catch(() => undefined);
      }
    }

    const pageFetcher: SnapshotPageFetcher = (snapshotCursor, offset) =>
      snapshotMobileSync({ accessToken, workspaceId, clientId, snapshotCursor, offset });

    await buildSnapshotGeneration({
      databaseName: name,
      key,
      subject,
      clientId,
      fetchPage: pageFetcher,
    });

    await setWorkspaceGeneration(alias, nextGeneration);
    await closeWorkspaceEntry(subject);
    markWorkspaceSyncDirty(subject, false);
    await deleteDatabaseAsync(databaseNameForGeneration(alias, currentGeneration)).catch(
      () => undefined,
    );
  });
}

async function readSignOutRisk(workspace: LocalWorkspace): Promise<LocalWorkspaceSignOutRisk> {
  const row = await workspace.database.getFirstAsync<{
    unsynced_operation_count: number;
    unresolved_conflict_count: number;
  }>(`
    SELECT
      (SELECT count(*) FROM sync_outbox
        WHERE state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted'))
        AS unsynced_operation_count,
      (SELECT count(*) FROM sync_conflicts WHERE resolved_at IS NULL)
        AS unresolved_conflict_count
  `);
  return {
    unsyncedOperationCount: row?.unsynced_operation_count ?? 0,
    unresolvedConflictCount: row?.unresolved_conflict_count ?? 0,
  };
}

/** Adds up what signing out would lose across the given workspace files, open or not. */
export async function inspectLocalWorkspaceForSignOut(
  subjects: readonly string[],
): Promise<LocalWorkspaceSignOutRisk> {
  const results = await Promise.all(
    subjects.map((subject) => withDetachedWorkspace(subject, readSignOutRisk)),
  );
  return results.reduce(
    (total, entry) => ({
      unsyncedOperationCount: total.unsyncedOperationCount + entry.unsyncedOperationCount,
      unresolvedConflictCount: total.unresolvedConflictCount + entry.unresolvedConflictCount,
    }),
    { unsyncedOperationCount: 0, unresolvedConflictCount: 0 },
  );
}

export async function closeLocalWorkspace(subject?: string, lease?: symbol): Promise<void> {
  if (subject) {
    return serializeForSubject(subject, async () => {
      const existing = openWorkspaces.get(subject);
      if (!existing) return;
      if (lease && (!existing.leases.delete(lease) || existing.leases.size > 0)) return;
      await closeWorkspaceEntry(subject);
    });
  }
  while (subjectQueues.size > 0 || openWorkspaces.size > 0) {
    const subjects = new Set([...subjectQueues.keys(), ...openWorkspaces.keys()]);
    await Promise.all(Array.from(subjects, (entry) => closeLocalWorkspace(entry)));
  }
}

export function discardLocalWorkspace(subject: string): Promise<void> {
  return serializeForSubject(subject, async () => {
    const alias = await workspaceAlias(subject);
    const generation = await getWorkspaceGeneration(alias);
    const name = databaseNameForGeneration(alias, generation);
    await closeWorkspaceEntry(subject);
    await deleteDatabaseAsync(name).catch((error: unknown) => {
      if (!(error instanceof Error) || !/not found|no such file/i.test(error.message)) throw error;
    });
    await removeWorkspaceKey(alias);
    await removeWorkspaceGeneration(alias);
    workspaceSyncDirty.delete(subject);
  });
}

/** Discards all listed workspaces concurrently while waiting for any pending per-subject work. */
export async function discardAllWorkspaces(subjects: readonly string[]): Promise<void> {
  await Promise.all(subjects.map((subject) => discardLocalWorkspace(subject)));
  await closeLocalWorkspace();
}
