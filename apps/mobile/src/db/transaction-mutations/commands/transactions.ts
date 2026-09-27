import { z } from "zod";

import {
  buildTransferLegs,
  normalizeSignedAmount,
  transactionInputSchema,
  transactionUpdateSchema,
  type TransactionInput,
  type TransactionUpdate,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import {
  LocalMutationError,
  asNonTransfer,
  commandFromRow,
  fullUpdate,
  snapshotFromRow,
  transferSnapshot,
  uuidSchema,
  validateLocalReferences,
  type NonTransferInput,
} from "../model";

/** Writes one ordinary transaction while the caller owns the SQLite transaction. */
export async function createNonTransfer(
  ctx: LocalCommandContext,
  input: NonTransferInput,
): Promise<string> {
  const dependencyIds = await validateLocalReferences(ctx.database, input, true);
  await ctx.clientId();
  const transactionId = uuidSchema.parse(ctx.randomUuid());
  const operationId = uuidSchema.parse(ctx.randomUuid());
  const idempotencyKey = uuidSchema.parse(ctx.randomUuid());
  const sequence = await ctx.store.nextSequence();
  await ctx.database.runAsync(
    `INSERT INTO transactions (
      id, account_id, category_id, date, description, amount_minor, currency, kind,
      notes, server_revision, server_updated_at, deleted_at, sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'pending')`,
    transactionId,
    input.accountId,
    input.categoryId,
    input.date,
    input.description,
    normalizeSignedAmount(input.amountMinor, input.kind),
    input.currency,
    input.kind,
    input.notes || null,
  );
  await ctx.database.runAsync(
    `INSERT INTO sync_outbox (
      operation_id, idempotency_key, entity_type, entity_id, operation_type,
      base_revision, payload_json, dependency_ids_json, base_json, created_sequence
    ) VALUES (?, ?, 'transaction', ?, 'create', 0, ?, ?, '{}', ?)`,
    operationId,
    idempotencyKey,
    transactionId,
    JSON.stringify(input),
    JSON.stringify(dependencyIds),
    sequence,
  );
  return transactionId;
}

/**
 * Persists a reviewed receipt's entries as one local operation: either every
 * line and its outbox record exist, or none do.
 */
export function createTransactions(
  ctx: LocalCommandContext,
  values: NonTransferInput[],
): Promise<string[]> {
  const inputs = z
    .array(transactionInputSchema)
    .min(1, "Add at least one receipt item.")
    .max(30, "A receipt can contain at most 30 items.")
    .parse(values)
    .map((input) => {
      if (input.kind === "transfer") {
        throw new LocalMutationError(
          "Receipt items must be income or expense transactions.",
          "mutation_blocked",
        );
      }
      return input;
    });
  return ctx.writer.run(async () => {
    const transactionIds: string[] = [];
    await ctx.database.withTransactionAsync(async () => {
      for (const input of inputs) transactionIds.push(await createNonTransfer(ctx, input));
    });
    return transactionIds;
  });
}

export function createTransaction(
  ctx: LocalCommandContext,
  value: TransactionInput,
): Promise<string> {
  const input = transactionInputSchema.parse(value);
  return ctx.writer.run(async () => {
    let transactionId = "";
    await ctx.database.withTransactionAsync(async () => {
      if (input.kind === "transfer") {
        await ctx.store.validateTransferReferences(input);
        await ctx.clientId();
        const groupId = uuidSchema.parse(ctx.randomUuid());
        const fromId = uuidSchema.parse(ctx.randomUuid());
        const toId = uuidSchema.parse(ctx.randomUuid());
        const operationId = uuidSchema.parse(ctx.randomUuid());
        const idempotencyKey = uuidSchema.parse(ctx.randomUuid());
        const [fromLeg, toLeg] = buildTransferLegs(input);
        const sequence = await ctx.store.nextSequence();
        for (const [id, leg] of [
          [fromId, fromLeg],
          [toId, toLeg],
        ] as const) {
          await ctx.database.runAsync(
            `INSERT INTO transactions (
              id, account_id, category_id, date, description, amount_minor, currency, kind,
              notes, transfer_group_id, transfer_fee_minor, server_revision,
              server_updated_at, deleted_at, sync_state
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, 0, NULL, NULL, 'pending')`,
            id,
            leg.accountId,
            input.categoryId,
            input.date,
            leg.description,
            leg.amountMinor,
            input.currency,
            input.notes || null,
            groupId,
            leg.transferFeeMinor,
          );
        }
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'transfer', ?, 'create', 0, ?, '[]', '{}', ?)`,
          operationId,
          idempotencyKey,
          groupId,
          JSON.stringify({ fromTransactionId: fromId, toTransactionId: toId, transfer: input }),
          sequence,
        );
        transactionId = fromId;
        return;
      }
      transactionId = await createNonTransfer(ctx, asNonTransfer(input));
    });
    return transactionId;
  });
}

export function updateTransaction(
  ctx: LocalCommandContext,
  id: string,
  value: TransactionUpdate,
): Promise<void> {
  const update = transactionUpdateSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentTransaction(id);
      if (
        current.deleted_at ||
        current.sync_state === "failed" ||
        current.sync_state === "conflicted"
      ) {
        throw new LocalMutationError(
          "Resolve this transaction's synchronization state before editing it.",
          "mutation_blocked",
        );
      }
      const existing = commandFromRow(current);
      const merged = asNonTransfer(
        transactionInputSchema.parse({
          ...existing,
          ...update,
          amountMinor: Math.abs(update.amountMinor ?? existing.amountMinor),
          notes: update.notes !== undefined ? update.notes : existing.notes,
        }),
      );
      const outbox = await ctx.store.currentOutbox("transaction", id);
      if (outbox?.operation_type === "delete") {
        throw new LocalMutationError(
          "This transaction is already waiting to be deleted.",
          "mutation_blocked",
        );
      }
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before editing this transaction.",
          "mutation_blocked",
        );
      }
      const dependencyIds = await validateLocalReferences(
        ctx.database,
        merged,
        current.server_revision === 0 && outbox?.operation_type === "create",
      );
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox
           SET payload_json = ?, dependency_ids_json = ?, state = 'pending', attempt_count = 0,
               next_attempt_at = NULL, last_error_code = NULL
           WHERE operation_id = ?`,
          JSON.stringify(outbox.operation_type === "create" ? merged : fullUpdate(merged)),
          JSON.stringify(dependencyIds),
          outbox.operation_id,
        );
      } else {
        const operationId = uuidSchema.parse(ctx.randomUuid());
        const idempotencyKey = uuidSchema.parse(ctx.randomUuid());
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'transaction', ?, 'update', ?, ?, '[]', ?, ?)`,
          operationId,
          idempotencyKey,
          id,
          current.server_revision,
          JSON.stringify(fullUpdate(merged)),
          JSON.stringify(snapshotFromRow(current)),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
        `UPDATE transactions SET
          account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?,
          currency = ?, kind = ?, notes = ?, sync_state = 'pending'
         WHERE id = ?`,
        merged.accountId,
        merged.categoryId,
        merged.date,
        merged.description,
        normalizeSignedAmount(merged.amountMinor, merged.kind),
        merged.currency,
        merged.kind,
        merged.notes || null,
        id,
      );
    });
  });
}

export function deleteTransaction(ctx: LocalCommandContext, id: string): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentTransaction(id);
      if (current.kind === "transfer" && current.transfer_group_id) {
        const pair = await ctx.store.currentTransfer(id);
        if (pair.from.deleted_at && pair.to.deleted_at) return;
        if (
          pair.from.sync_state === "failed" ||
          pair.to.sync_state === "failed" ||
          pair.from.sync_state === "conflicted" ||
          pair.to.sync_state === "conflicted"
        ) {
          throw new LocalMutationError(
            "Resolve this transfer's synchronization state before deleting it.",
            "mutation_blocked",
          );
        }
        const outbox = await ctx.store.currentOutbox("transfer", pair.groupId);
        if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
          throw new LocalMutationError(
            "Wait for the current synchronization attempt before deleting this transfer.",
            "mutation_blocked",
          );
        }
        if (pair.from.server_revision === 0 && outbox?.operation_type === "create") {
          await ctx.database.runAsync(
            "DELETE FROM sync_outbox WHERE operation_id = ?",
            outbox.operation_id,
          );
          await ctx.database.runAsync(
            "DELETE FROM transactions WHERE transfer_group_id = ?",
            pair.groupId,
          );
          return;
        }
        if (outbox) {
          await ctx.database.runAsync(
            `UPDATE sync_outbox SET operation_type = 'delete', payload_json = '{}',
              state = 'pending', attempt_count = 0, next_attempt_at = NULL,
              last_error_code = NULL WHERE operation_id = ?`,
            outbox.operation_id,
          );
        } else {
          await ctx.database.runAsync(
            `INSERT INTO sync_outbox (
              operation_id, idempotency_key, entity_type, entity_id, operation_type,
              base_revision, payload_json, dependency_ids_json, base_json, created_sequence
            ) VALUES (?, ?, 'transfer', ?, 'delete', ?, '{}', '[]', ?, ?)`,
            uuidSchema.parse(ctx.randomUuid()),
            uuidSchema.parse(ctx.randomUuid()),
            pair.groupId,
            pair.from.server_revision,
            JSON.stringify(transferSnapshot(pair)),
            await ctx.store.nextSequence(),
          );
        }
        await ctx.database.runAsync(
          `UPDATE transactions SET deleted_at = ?, sync_state = 'pending'
           WHERE transfer_group_id = ?`,
          ctx.now().toISOString(),
          pair.groupId,
        );
        return;
      }
      if (current.deleted_at) return;
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this transaction's synchronization state before deleting it.",
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox("transaction", id);
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before deleting this transaction.",
          "mutation_blocked",
        );
      }
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync("DELETE FROM transactions WHERE id = ?", id);
        return;
      }
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox
           SET operation_type = 'delete', payload_json = '{}', state = 'pending',
               attempt_count = 0, next_attempt_at = NULL, last_error_code = NULL
           WHERE operation_id = ?`,
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'transaction', ?, 'delete', ?, '{}', '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(snapshotFromRow(current)),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
        "UPDATE transactions SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
        ctx.now().toISOString(),
        id,
      );
    });
  });
}
