import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { snapshotMobileSync } from "@/api/mobile-sync";
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
import { LocalWorkspaceRepository, type LocalWorkspaceStats } from "./repository";
import { applySnapshotChange, LocalSyncRepository } from "./sync-repository";
import { LocalDatabaseWriter } from "./database-writer";
import { LocalTransactionMutationRepository } from "./transaction-mutation-repository";
import {
  collectSnapshotPages,
  databaseNameForGeneration,
  verifySnapshotGeneration,
  type SnapshotPageFetcher,
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
  await database.execAsync("PRAGMA foreign_keys = ON");
  await database.execAsync("PRAGMA journal_mode = WAL");
  await database.execAsync("PRAGMA synchronous = FULL");
  await database.execAsync("PRAGMA secure_delete = ON");
  await database.execAsync("PRAGMA busy_timeout = 5000");
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

let current: {
  subject: string;
  alias: string;
  generation: number;
  workspace: LocalWorkspace;
} | null = null;
let operation = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = operation.then(task, task);
  operation = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function openWorkspaceInternal(subject: string): Promise<LocalWorkspace> {
  if (current?.subject === subject) return current.workspace;
  if (current) {
    await current.workspace.database.closeAsync();
    current = null;
  }

  const alias = await workspaceAlias(subject);
  const generation = await getWorkspaceGeneration(alias);
  const name = databaseNameForGeneration(alias, generation);
  const key = await getOrCreateWorkspaceKey(alias);
  await ensureLocalDataBackupProtection();
  const database = await openDatabaseAsync(name, {
    enableChangeListener: true,
    useNewConnection: true,
  });
  try {
    await configureEncryptedDatabase(database, key);
    let schemaVersion: number;
    try {
      schemaVersion = await applyLocalMigrations(asMigrationDatabase(database));
      await assertWorkspaceSubject(database, subject);
    } catch (error) {
      throw new LocalWorkspaceError(
        `The encrypted workspace migration did not complete. Zoption preserved it for recovery.${developmentDetail(error)}`,
        { cause: error },
      );
    }
    const writer = new LocalDatabaseWriter();
    const workspace = {
      database,
      databaseName: name,
      repository: new LocalWorkspaceRepository(database),
      syncRepository: new LocalSyncRepository(database, writer),
      transactionMutations: new LocalTransactionMutationRepository(database, writer),
      schemaVersion,
      generation,
    };
    current = { subject, alias, generation, workspace };
    return workspace;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

export function openLocalWorkspace(subject: string): Promise<LocalWorkspace> {
  return serialize(() => openWorkspaceInternal(subject));
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

async function buildSnapshotGeneration({
  databaseName: name,
  key,
  subject,
  clientId,
  fetchPage,
}: {
  databaseName: string;
  key: string;
  subject: string;
  clientId: string;
  fetchPage: SnapshotPageFetcher;
}): Promise<void> {
  const database = await openDatabaseAsync(name, { useNewConnection: true });
  try {
    await configureEncryptedDatabase(database, key);
    await applyLocalMigrations(asMigrationDatabase(database));
    await database.runAsync(
      "INSERT INTO workspace_metadata (key, value) VALUES ('supabase_subject', ?)",
      subject,
    );
    await database.runAsync(
      "INSERT INTO workspace_metadata (key, value) VALUES ('mobile_client_id', ?)",
      clientId,
    );
    const collected = await collectSnapshotPages(fetchPage);
    for (const change of collected.changes) {
      await applySnapshotChange(database, change);
    }
    await database.runAsync(
      "UPDATE sync_metadata SET server_cursor = ? WHERE singleton = 1",
      collected.resumeCursor,
    );
    await verifySnapshotGeneration(database, subject, clientId, collected.resumeCursor);
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    await deleteDatabaseAsync(name).catch(() => undefined);
    throw error;
  }
  await database.closeAsync();
}

export function recoverLocalWorkspace(
  subject: string,
  accessToken: string,
  fetchPage?: SnapshotPageFetcher,
): Promise<void> {
  return serialize(async () => {
    const alias = await workspaceAlias(subject);
    const key = await getOrCreateWorkspaceKey(alias);
    const currentGeneration = await getWorkspaceGeneration(alias);
    const nextGeneration = currentGeneration + 1;
    const name = databaseNameForGeneration(alias, nextGeneration);

    const workspace =
      current?.subject === subject ? current.workspace : await openWorkspaceInternal(subject);
    const clientId = await workspace.transactionMutations.clientId();

    const pageFetcher: SnapshotPageFetcher =
      fetchPage ??
      ((snapshotCursor, offset) =>
        snapshotMobileSync({ accessToken, clientId, snapshotCursor, offset }));

    await buildSnapshotGeneration({
      databaseName: name,
      key,
      subject,
      clientId,
      fetchPage: pageFetcher,
    });

    await setWorkspaceGeneration(alias, nextGeneration);
    if (current?.subject === subject) {
      await current.workspace.database.closeAsync();
      current = null;
    }
    await deleteDatabaseAsync(databaseNameForGeneration(alias, currentGeneration)).catch(
      () => undefined,
    );
  });
}

export async function inspectLocalWorkspaceForSignOut(
  subject: string,
): Promise<LocalWorkspaceSignOutRisk> {
  const workspace = await openLocalWorkspace(subject);
  const stats: LocalWorkspaceStats = await workspace.repository.getStats();
  return {
    unsyncedOperationCount: stats.unsyncedOperationCount,
    unresolvedConflictCount: stats.unresolvedConflictCount,
  };
}

export function closeLocalWorkspace(subject?: string): Promise<void> {
  return serialize(async () => {
    if (!current || (subject && current.subject !== subject)) return;
    await current.workspace.database.closeAsync();
    current = null;
  });
}

export function discardLocalWorkspace(subject: string): Promise<void> {
  return serialize(async () => {
    const alias = await workspaceAlias(subject);
    const generation = await getWorkspaceGeneration(alias);
    const name = databaseNameForGeneration(alias, generation);
    if (current?.subject === subject) {
      await current.workspace.database.closeAsync();
      current = null;
    }
    await deleteDatabaseAsync(name).catch((error: unknown) => {
      if (!(error instanceof Error) || !/not found|no such file/i.test(error.message)) throw error;
    });
    await removeWorkspaceKey(alias);
    await removeWorkspaceGeneration(alias);
  });
}
