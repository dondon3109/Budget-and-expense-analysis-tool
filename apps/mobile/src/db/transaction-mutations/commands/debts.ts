import {
  debtInputSchema,
  debtUpdateSchema,
  type DebtInput,
  type DebtUpdate,
} from "@zoption/shared";

import type { LocalCommandContext } from "../context";
import { debtSnapshot, uuidSchema } from "../model";
import {
  assertRowSettled,
  assertNotQueuedForRemoval,
  assertNoAttemptInFlight,
  queueCreate,
  queueUpdate,
  queueDelete,
} from "./outbox-writes";

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
      await queueCreate(ctx, "debt", entityId, {
        name: input.name,
        type: input.type,
        balanceMinor: input.balanceMinor,
        aprBasisPoints: input.aprBasisPoints,
        minimumPaymentMinor: input.minimumPaymentMinor,
        balanceAsOf: input.balanceAsOf,
        status: input.status,
      });
    });
    return entityId;
  });
}

export function updateDebt(ctx: LocalCommandContext, id: string, value: DebtUpdate): Promise<void> {
  const update = debtUpdateSchema.parse(value);
  return ctx.writer.run(async () => {
    await ctx.database.withTransactionAsync(async () => {
      const current = await ctx.store.currentDebtById(id);
      assertRowSettled(current.sync_state, "debt", "editing");
      const outbox = await ctx.store.currentOutbox("debt", id);
      assertNotQueuedForRemoval(outbox, "debt", "deleted");
      assertNoAttemptInFlight(outbox, "debt", "editing");
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
      await queueUpdate(ctx, outbox, {
        entityType: "debt",
        entityId: id,
        baseRevision: current.server_revision,
        payload: merged,
        base: () => debtSnapshot(current),
      });
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
      assertRowSettled(current.sync_state, "debt", "deleting");
      const outbox = await ctx.store.currentOutbox("debt", id);
      assertNoAttemptInFlight(outbox, "debt", "deleting");
      if (current.server_revision === 0 && outbox?.operation_type === "create") {
        await ctx.database.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          outbox.operation_id,
        );
        await ctx.database.runAsync("DELETE FROM debts WHERE id = ?", id);
        return;
      }
      await queueDelete(ctx, outbox, {
        entityType: "debt",
        entityId: id,
        baseRevision: current.server_revision,
        base: () => debtSnapshot(current),
      });
      await ctx.database.runAsync(
        "UPDATE debts SET deleted_at = ?, sync_state = 'pending' WHERE id = ?",
        ctx.now().toISOString(),
        id,
      );
    });
  });
}
