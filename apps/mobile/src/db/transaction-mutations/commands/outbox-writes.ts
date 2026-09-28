import type { MobileSyncPushOperation } from "@zoption/shared";
import type { z } from "zod";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, uuidSchema, type outboxRowSchema } from "../model";

// Helpers for the steps every user mutation repeats. Each runs inside the caller's
// withTransactionAsync callback; none opens a transaction of its own, so a row and its outbox
// entry still commit or roll back together.

type OutboxRow = z.infer<typeof outboxRowSchema>;
type OutboxEntityType = MobileSyncPushOperation["entityType"];
type BlockedVerb = "editing" | "deleting" | "archiving";

/** A failed or conflicted row needs the user to resolve it before another local change. */
export function assertRowSettled(syncState: string, label: string, verb: BlockedVerb): void {
  if (syncState === "failed" || syncState === "conflicted") {
    throw new LocalMutationError(
      `Resolve this ${label}'s synchronization state before ${verb} it.`,
      "mutation_blocked",
    );
  }
}

/** A queued delete or archive cannot be edited back into an update. */
export function assertNotQueuedForRemoval(
  outbox: OutboxRow | null,
  label: string,
  removal: "deleted" | "archived",
): void {
  if (outbox?.operation_type === "delete") {
    throw new LocalMutationError(
      `This ${label} is already waiting to be ${removal}.`,
      "mutation_blocked",
    );
  }
}

/** An outbox entry already sent, or waiting on a retry, must settle before it is rewritten. */
export function assertNoAttemptInFlight(
  outbox: OutboxRow | null,
  label: string,
  verb: BlockedVerb,
): void {
  if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
    throw new LocalMutationError(
      `Wait for the current synchronization attempt before ${verb} this ${label}.`,
      "mutation_blocked",
    );
  }
}

/** Queues the create for a row the caller just inserted. */
export async function queueCreate(
  ctx: LocalCommandContext,
  entityType: OutboxEntityType,
  entityId: string,
  payload: unknown,
): Promise<void> {
  await ctx.database.runAsync(
    `INSERT INTO sync_outbox (
      operation_id, idempotency_key, entity_type, entity_id, operation_type,
      base_revision, payload_json, dependency_ids_json, base_json, created_sequence
    ) VALUES (?, ?, ?, ?, 'create', 0, ?, '[]', '{}', ?)`,
    uuidSchema.parse(ctx.randomUuid()),
    uuidSchema.parse(ctx.randomUuid()),
    entityType,
    entityId,
    JSON.stringify(payload),
    await ctx.store.nextSequence(),
  );
}

interface QueuedChange {
  entityType: OutboxEntityType;
  entityId: string;
  baseRevision: number;
  /** The server snapshot the change was made against; read only when a new entry is queued. */
  base: () => unknown;
}

/**
 * Rewrites the pending outbox entry with `payload`, or queues a new update against the synced
 * row. The entry keeps its operation type, so an unsynced create stays a create.
 */
export async function queueUpdate(
  ctx: LocalCommandContext,
  outbox: OutboxRow | null,
  change: QueuedChange & { payload: unknown },
): Promise<void> {
  if (outbox) {
    await ctx.database.runAsync(
      `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
        next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
      JSON.stringify(change.payload),
      outbox.operation_id,
    );
    return;
  }
  await ctx.database.runAsync(
    `INSERT INTO sync_outbox (
      operation_id, idempotency_key, entity_type, entity_id, operation_type,
      base_revision, payload_json, dependency_ids_json, base_json, created_sequence
    ) VALUES (?, ?, ?, ?, 'update', ?, ?, '[]', ?, ?)`,
    uuidSchema.parse(ctx.randomUuid()),
    uuidSchema.parse(ctx.randomUuid()),
    change.entityType,
    change.entityId,
    change.baseRevision,
    JSON.stringify(change.payload),
    JSON.stringify(change.base()),
    await ctx.store.nextSequence(),
  );
}

/** Turns the pending outbox entry into a delete, or queues a new delete against the synced row. */
export async function queueDelete(
  ctx: LocalCommandContext,
  outbox: OutboxRow | null,
  change: QueuedChange,
): Promise<void> {
  if (outbox) {
    await ctx.database.runAsync(
      `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
        state = 'pending', attempt_count = 0, next_attempt_at = NULL,
        last_error_code = NULL WHERE operation_id = ?`,
      outbox.operation_id,
    );
    return;
  }
  await ctx.database.runAsync(
    `INSERT INTO sync_outbox (
      operation_id, idempotency_key, entity_type, entity_id, operation_type,
      base_revision, payload_json, dependency_ids_json, base_json, created_sequence
    ) VALUES (?, ?, ?, ?, 'delete', ?, '{}', '[]', ?, ?)`,
    uuidSchema.parse(ctx.randomUuid()),
    uuidSchema.parse(ctx.randomUuid()),
    change.entityType,
    change.entityId,
    change.baseRevision,
    JSON.stringify(change.base()),
    await ctx.store.nextSequence(),
  );
}
