import {
  debtInputSchema,
  debtUpdateSchema,
  type DebtInput,
  type DebtUpdate,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { LocalMutationError, debtSnapshot, uuidSchema } from "../model";

export function createDebt(ctx: LocalCommandContext, value: DebtInput): Promise<string> {
  const input = debtInputSchema.parse(value);
  return ctx.writer.run(async () => {
    let entityId = "";
    await ctx.database.withTransactionAsync(async () => {
      await ctx.store.assertUniqueName("debt", input.name);
      await ctx.clientId();
      entityId = uuidSchema.parse(ctx.randomUuid());
      await ctx.database.runAsync(
        `INSERT INTO debts (
          id, name, type, balance_minor, apr_basis_points, minimum_payment_minor,
          balance_as_of, status, server_revision, server_updated_at, deleted_at, sync_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'pending')`,
        entityId,
        input.name,
        input.type,
        input.balanceMinor,
        input.aprBasisPoints,
        input.minimumPaymentMinor,
        input.balanceAsOf,
        input.status,
      );
      await ctx.database.runAsync(
        `INSERT INTO sync_outbox (
          operation_id, idempotency_key, entity_type, entity_id, operation_type,
          base_revision, payload_json, dependency_ids_json, base_json, created_sequence
        ) VALUES (?, ?, 'debt', ?, 'create', 0, ?, '[]', '{}', ?)`,
        uuidSchema.parse(ctx.randomUuid()),
        uuidSchema.parse(ctx.randomUuid()),
        entityId,
        JSON.stringify({
          name: input.name,
          type: input.type,
          balanceMinor: input.balanceMinor,
          aprBasisPoints: input.aprBasisPoints,
          minimumPaymentMinor: input.minimumPaymentMinor,
          balanceAsOf: input.balanceAsOf,
          status: input.status,
        }),
        await ctx.store.nextSequence(),
      );
    });
    return entityId;
  });
}

export function updateDebt(ctx: LocalCommandContext, id: string, value: DebtUpdate): Promise<void> {
  const update = debtUpdateSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentDebtById(id);
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this debt's synchronization state before editing it.",
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox("debt", id);
      if (outbox?.operation_type === "delete") {
        throw new LocalMutationError(
          "This debt is already waiting to be deleted.",
          "mutation_blocked",
        );
      }
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before editing this debt.",
          "mutation_blocked",
        );
      }
      const merged = {
        name: update.name ?? current.name,
        type: update.type ?? current.type,
        balanceMinor: update.balanceMinor ?? current.balance_minor,
        aprBasisPoints: update.aprBasisPoints ?? current.apr_basis_points,
        minimumPaymentMinor: update.minimumPaymentMinor ?? current.minimum_payment_minor,
        balanceAsOf: update.balanceAsOf ?? current.balance_as_of,
        status: update.status ?? current.status,
      };
      if (update.name) await ctx.store.assertUniqueName("debt", update.name, id);
      if (outbox) {
        await ctx.database.runAsync(
          `UPDATE sync_outbox SET payload_json = ?, state = 'pending', attempt_count = 0,
            next_attempt_at = NULL, last_error_code = NULL WHERE operation_id = ?`,
          JSON.stringify(merged),
          outbox.operation_id,
        );
      } else {
        await ctx.database.runAsync(
          `INSERT INTO sync_outbox (
            operation_id, idempotency_key, entity_type, entity_id, operation_type,
            base_revision, payload_json, dependency_ids_json, base_json, created_sequence
          ) VALUES (?, ?, 'debt', ?, 'update', ?, ?, '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(merged),
          JSON.stringify(debtSnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
        `UPDATE debts SET
          name = ?, type = ?, balance_minor = ?, apr_basis_points = ?,
          minimum_payment_minor = ?, balance_as_of = ?, status = ?, sync_state = 'pending'
         WHERE id = ?`,
        merged.name,
        merged.type,
        merged.balanceMinor,
        merged.aprBasisPoints,
        merged.minimumPaymentMinor,
        merged.balanceAsOf,
        merged.status,
        id,
      );
    });
  });
}

export function deleteDebt(ctx: LocalCommandContext, id: string): Promise<void> {
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentDebtById(id);
      if (current.sync_state === "failed" || current.sync_state === "conflicted") {
        throw new LocalMutationError(
          "Resolve this debt's synchronization state before deleting it.",
          "mutation_blocked",
        );
      }
      const outbox = await ctx.store.currentOutbox("debt", id);
      if (outbox && (outbox.state !== "pending" || outbox.attempt_count > 0)) {
        throw new LocalMutationError(
          "Wait for the current synchronization attempt before deleting this debt.",
          "mutation_blocked",
        );
      }
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync("DELETE FROM debts WHERE id = ?", id);
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
          ) VALUES (?, ?, 'debt', ?, 'delete', ?, '{}', '[]', ?, ?)`,
          uuidSchema.parse(ctx.randomUuid()),
          uuidSchema.parse(ctx.randomUuid()),
          id,
          current.server_revision,
          JSON.stringify(debtSnapshot(current)),
          await ctx.store.nextSequence(),
        );
      }
      await ctx.database.runAsync(
        "UPDATE debts SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
        ctx.now().toISOString(),
        id,
      );
    });
  });
}
