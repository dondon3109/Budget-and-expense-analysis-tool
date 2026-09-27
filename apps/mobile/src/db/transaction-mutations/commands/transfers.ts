import {
  buildTransferLegs,
  mobileSyncPushOperationSchema,
  transferInputSchema,
  type TransferInput,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, transferSnapshot, uuidSchema } from "../model";

export function updateTransfer(
  ctx: LocalCommandContext,
  id: string,
  value: TransferInput,
): Promise<void> {
  const input = transferInputSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const pair = await ctx.store.currentTransfer(id);
      if (
        pair.from.deleted_at ||
        pair.to.deleted_at ||
        pair.from.sync_state === "failed" ||
        pair.to.sync_state === "failed" ||
        pair.from.sync_state === "conflicted" ||
        pair.to.sync_state === "conflicted"
      ) {
        throw new LocalMutationError(
          "Resolve this transfer's synchronization state before editing it.",
          "mutation_blocked",
        );
      }
      await ctx.store.validateTransferReferences(input);
      const outbox = await ctx.store.currentOutbox("transfer", pair.groupId);
      if (outbox?.operation_type === "delete") {
        throw new LocalMutationError(
          "This transfer is already waiting to be deleted.",
          "mutation_blocked",
        );
      }
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before editing this transfer.",
          "mutation_blocked",
        );
      }
      if (outbox) {
        let payload: unknown;
        try {
          payload = JSON.parse(outbox.payload_json) as unknown;
        } catch {
          throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
        }
        const operation = mobileSyncPushOperationSchema.parse({
          operationId: outbox.operation_id,
          idempotencyKey: outbox.idempotency_key,
          entityType: "transfer",
          entityId: pair.groupId,
          operationType: outbox.operation_type,
          baseRevision: outbox.base_revision,
          dependencyIds: [],
          payload,
        });
        if (operation.entityType !== "transfer" || operation.operationType === "delete") {
          throw new LocalMutationError("The encrypted outbox is invalid.", "invalid_outbox");
        }
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
            next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
          JSON.stringify(
            operation.operationType === "create"
              ? { ...operation.payload, transfer: input }
              : { transfer: input },
          ),
          operation.operationId,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'transfer', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          pair.groupId,
          pair.from.server_revision,
          JSON.stringify({ transfer: input }),
          JSON.stringify(transferSnapshot(pair)),
          await ctx.store.nextSequence(),
        );
      }
      const [fromLeg, toLeg] = buildTransferLegs(input);
      for (const [row, leg] of [
        [pair.from, fromLeg],
        [pair.to, toLeg],
      ] as const) {
        await ctx.database.runAsync(
          `UPDATE transactions SET account_id = ?, category_id = ?, date = ?,
            description = ?, amount_minor = ?, currency = ?, notes = ?,
            transfer_fee_minor = ?, sync_state = 'pending' WHERE id = ?`,
          leg.accountId,
          input.categoryId,
          input.date,
          leg.description,
          leg.amountMinor,
          input.currency,
          input.notes || null,
          leg.transferFeeMinor,
          row.id,
        );
      }
    });
  });
}
