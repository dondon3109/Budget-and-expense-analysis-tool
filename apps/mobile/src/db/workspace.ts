import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { getOrCreateWorkspaceKey, removeWorkspaceKey, workspaceAlias } from "./key-store";
import { ensureLocalDataBackupProtection } from "./local-data-security";
import { applyLocalMigrations, asMigrationDatabase } from "./migrations";
import { LocalWorkspaceRepository, type LocalWorkspaceStats } from "./repository";
import { LocalSyncRepository } from "./sync-repository";
import { LocalDatabaseWriter } from "./database-writer";
import { LocalTransactionMutationRepository } from "./transaction-mutation-repository";

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
}

export interface LocalWorkspaceSignOutRisk {
  unsyncedOperationCount: number;
  unresolvedConflictCount: number;
}

function databaseName(alias: string): string {
  return `zoption-${alias.slice(0, 32)}.db`;
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

let current: { subject: string; alias: string; workspace: LocalWorkspace } | null = null;
let operation = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = operation.then(task, task);
  operation = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function openLocalWorkspace(subject: string): Promise<LocalWorkspace> {
  return serialize(async () => {
    if (current?.subject === subject) return current.workspace;
    if (current) {
      await current.workspace.database.closeAsync();
      current = null;
    }

    const alias = await workspaceAlias(subject);
    const name = databaseName(alias);
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
      };
      current = { subject, alias, workspace };
      return workspace;
    } catch (error) {
      await database.closeAsync().catch(() => undefined);
      throw error;
    }
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
    const name = databaseName(alias);
    if (current?.subject === subject) {
      await current.workspace.database.closeAsync();
      current = null;
    }
    await deleteDatabaseAsync(name).catch((error: unknown) => {
      if (!(error instanceof Error) || !/not found|no such file/i.test(error.message)) throw error;
    });
    await removeWorkspaceKey(alias);
  });
}
