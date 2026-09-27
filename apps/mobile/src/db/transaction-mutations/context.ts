import type { SQLiteDatabase } from "expo-sqlite";

import type { LocalDatabaseWriter } from "../database-writer";
import type { LocalMutationStore } from "./store";

/** Dependencies shared by the conflict resolvers and the user mutation commands. */
export interface LocalMutationContext {
  readonly database: SQLiteDatabase;
  readonly writer: LocalDatabaseWriter;
  readonly store: LocalMutationStore;
  readonly randomUuid: () => string;
  readonly now: () => Date;
}

/** Commands also stamp the workspace client id before writing a new row. */
export interface LocalCommandContext extends LocalMutationContext {
  readonly clientId: () => Promise<string>;
}
