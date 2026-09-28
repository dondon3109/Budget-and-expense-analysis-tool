import type { SQLiteDatabase } from "expo-sqlite";

import type { LocalDatabaseWriter } from "../database-writer";
import type { LocalMutationContext } from "./context";
import { getConflict, resolveConflict } from "./conflicts/transactions";
import { getReferenceConflict, resolveReferenceConflict } from "./conflicts/references";
import { getBudgetConflict, resolveBudgetConflict } from "./conflicts/budgets";
import { getGoalConflict, resolveGoalConflict } from "./conflicts/goals";
import { getDebtConflict, resolveDebtConflict } from "./conflicts/debts";
import { getSubscriptionConflict, resolveSubscriptionConflict } from "./conflicts/subscriptions";
import { getEventConflict, resolveEventConflict } from "./conflicts/events";
import type {
  LocalBudgetConflict,
  LocalDebtConflict,
  LocalEventConflict,
  LocalGoalConflict,
  LocalReferenceConflict,
  LocalSubscriptionConflict,
  LocalTransactionConflict,
} from "./model";
import type { LocalMutationStore } from "./store";

/**
 * Conflict inspection and explicit user-directed resolution for every synchronized entity.
 * Each entity's reads and resolutions live in conflicts/<entity>.ts; this class keeps the
 * constructor and method surface the mutation facade uses.
 */
export class LocalConflictRepository {
  private readonly ctx: LocalMutationContext;

  constructor(
    database: SQLiteDatabase,
    writer: LocalDatabaseWriter,
    store: LocalMutationStore,
    randomUuid: () => string,
    now: () => Date,
  ) {
    this.ctx = { database, writer, store, randomUuid, now };
  }

  getConflict(entityId: string): Promise<LocalTransactionConflict | null> {
    return getConflict(this.ctx, entityId);
  }

  resolveConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return resolveConflict(this.ctx, entityId, resolution);
  }

  getReferenceConflict(
    entityType: "account" | "category",
    entityId: string,
  ): Promise<LocalReferenceConflict | null> {
    return getReferenceConflict(this.ctx, entityType, entityId);
  }

  resolveReferenceConflict(
    entityType: "account" | "category",
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return resolveReferenceConflict(this.ctx, entityType, entityId, resolution);
  }

  getBudgetConflict(entityId: string): Promise<LocalBudgetConflict | null> {
    return getBudgetConflict(this.ctx, entityId);
  }

  resolveBudgetConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return resolveBudgetConflict(this.ctx, entityId, resolution);
  }

  getGoalConflict(entityId: string): Promise<LocalGoalConflict | null> {
    return getGoalConflict(this.ctx, entityId);
  }

  resolveGoalConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return resolveGoalConflict(this.ctx, entityId, resolution);
  }

  getDebtConflict(entityId: string): Promise<LocalDebtConflict | null> {
    return getDebtConflict(this.ctx, entityId);
  }

  resolveDebtConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return resolveDebtConflict(this.ctx, entityId, resolution);
  }

  getSubscriptionConflict(entityId: string): Promise<LocalSubscriptionConflict | null> {
    return getSubscriptionConflict(this.ctx, entityId);
  }

  resolveSubscriptionConflict(
    entityId: string,
    resolution: "keep_local" | "keep_server",
  ): Promise<void> {
    return resolveSubscriptionConflict(this.ctx, entityId, resolution);
  }

  getEventConflict(entityId: string): Promise<LocalEventConflict | null> {
    return getEventConflict(this.ctx, entityId);
  }

  resolveEventConflict(entityId: string, resolution: "keep_local" | "keep_server"): Promise<void> {
    return resolveEventConflict(this.ctx, entityId, resolution);
  }
}
